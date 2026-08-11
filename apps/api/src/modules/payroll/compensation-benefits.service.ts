import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DeMinimisType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { AssignDeMinimisDto, ThirteenthMonthQuery } from './dto';
import { DE_MINIMIS_CATALOG, DE_MINIMIS_RULES, capDeMinimisAmount } from './de-minimis';
import { PayrollSettingsService } from './payroll-settings.service';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * BUG-BC — Compensation & Benefits.
 *
 * Two concerns that both sit beside payroll without altering how payroll
 * computes tax or contributions:
 *
 *  - the 13th-month tracker, which is a *read* over already-generated line
 *    items (Jan 1 – Dec 31 basic salary ÷ 12), and
 *  - de minimis assignments, which payroll later reads and pays as a
 *    non-taxable addition to net pay.
 */
@Injectable()
export class CompensationBenefitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PayrollSettingsService,
  ) {}

  // ── 13th-Month Pay Tracker ─────────────────────────────────────────────────

  /**
   * Aggregate basic salary earned between Jan 1 and Dec 31 of `year`.
   *
   * "Basic salary" for 13th-month purposes is regular pay for days worked. It
   * deliberately excludes overtime, night differential, holiday and rest-day
   * premiums (which DOLE treats as excluded unless the employer has integrated
   * them), and excludes any prior 13th-month run so the payout never
   * compounds on itself.
   */
  async getThirteenthMonthTracker(p: AuthPrincipal, query: ThirteenthMonthQuery) {
    const year = query.year ?? new Date().getFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        isThirteenthMonth: false,
        ...(query.employeeId ? { userId: query.employeeId } : {}),
        payrollReport: {
          period: { startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
        },
      },
      select: {
        userId: true,
        regularPay: true,
        deMinimisTotal: true,
        payrollReport: { select: { period: { select: { startDate: true } } } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const byUser = new Map<
      string,
      {
        employee: (typeof lineItems)[number]['user'];
        ytdBasicSalary: number;
        months: Set<number>;
        periodsCounted: number;
      }
    >();

    // BUG-BY — policy comes from the organization's settings, resolved per
    // request. Nothing is cached, so an admin's change applies to the very next
    // read of this tracker rather than waiting on a restart or a recalculation.
    const config = await this.settings.forPrincipal(p);

    for (const li of lineItems) {
      let row = byUser.get(li.userId);
      if (!row) {
        row = { employee: li.user, ytdBasicSalary: 0, months: new Set(), periodsCounted: 0 };
        byUser.set(li.userId, row);
      }
      row.ytdBasicSalary +=
        Number(li.regularPay) +
        (config.thirteenthMonthIncludesDeMinimis ? Number(li.deMinimisTotal) : 0);
      row.periodsCounted += 1;
      row.months.add(li.payrollReport.period.startDate.getUTCMonth());
    }

    const employees = [...byUser.values()]
      .map((row) => {
        const ytdBasicSalary = round2(row.ytdBasicSalary);
        return {
          employee: row.employee,
          year,
          ytdBasicSalary,
          /** Distinct calendar months with at least one generated period. */
          monthsWithEarnings: row.months.size,
          periodsCounted: row.periodsCounted,
          /** DOLE formula: total basic salary earned in the year ÷ 12. */
          thirteenthMonthPay: round2(ytdBasicSalary / 12),
        };
      })
      .sort((a, b) => a.employee.lastName.localeCompare(b.employee.lastName));

    return {
      year,
      periodStart: yearStart.toISOString(),
      periodEnd: yearEnd.toISOString(),
      headcount: employees.length,
      totalYtdBasicSalary: round2(employees.reduce((s, e) => s + e.ytdBasicSalary, 0)),
      totalThirteenthMonthPay: round2(
        employees.reduce((s, e) => s + e.thirteenthMonthPay, 0),
      ),
      // Echoed so the tracker screen can state the policy the figures were
      // produced under, rather than leaving the reader to guess.
      settings: {
        includesDeMinimis: config.thirteenthMonthIncludesDeMinimis,
        exemptionCap: config.thirteenthMonthExemptionCap,
      },
      employees,
    };
  }

  // ── De Minimis Benefits ────────────────────────────────────────────────────

  /** BIR ceiling catalog, so the UI can label and validate inputs client-side. */
  getDeMinimisCatalog() {
    return DE_MINIMIS_CATALOG;
  }

  async listDeMinimis(p: AuthPrincipal, employeeId?: string) {
    return this.prisma.deMinimisBenefit.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true },
        },
      },
      orderBy: [{ employeeId: 'asc' }, { benefitType: 'asc' }],
    });
  }

  async assignDeMinimis(p: AuthPrincipal, dto: AssignDeMinimisDto) {
    const employee = await this.prisma.user.findFirst({
      where: {
        id: dto.employeeId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const { amount, cap, wasCapped } = capDeMinimisAmount(dto.benefitType, dto.monthlyAmount);

    // One active assignment per (employee, benefit type): re-assigning the same
    // benefit amends the existing row rather than stacking a second allowance
    // that would silently double the ceiling.
    const existing = await this.prisma.deMinimisBenefit.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: dto.employeeId,
        benefitType: dto.benefitType,
        deletedAt: null,
      },
    });

    const data = {
      monthlyAmount: new Prisma.Decimal(amount),
      requestedAmount: new Prisma.Decimal(dto.monthlyAmount),
      birMonthlyCap: cap === null ? null : new Prisma.Decimal(cap),
      isActive: dto.isActive ?? true,
      notes: dto.notes ?? null,
      updatedBy: p.userId,
    };

    const benefit = existing
      ? await this.prisma.deMinimisBenefit.update({ where: { id: existing.id }, data })
      : await this.prisma.deMinimisBenefit.create({
          data: {
            ...data,
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            employeeId: dto.employeeId,
            benefitType: dto.benefitType,
            createdBy: p.userId,
          },
        });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'de_minimis_benefit',
        entityId: benefit.id,
        metadata: {
          event: existing ? 'DE_MINIMIS_UPDATED' : 'DE_MINIMIS_ASSIGNED',
          employeeId: dto.employeeId,
          benefitType: dto.benefitType,
          requestedAmount: dto.monthlyAmount,
          effectiveAmount: amount,
          birMonthlyCap: cap,
          wasCapped,
        },
      },
    });

    return {
      ...benefit,
      wasCapped,
      capLabel: DE_MINIMIS_RULES[dto.benefitType]?.statutoryBasis ?? null,
    };
  }

  async removeDeMinimis(p: AuthPrincipal, id: string) {
    const benefit = await this.prisma.deMinimisBenefit.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!benefit) throw new NotFoundException('De minimis benefit not found');

    await this.prisma.deMinimisBenefit.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: p.userId },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'de_minimis_benefit',
        entityId: id,
        metadata: {
          event: 'DE_MINIMIS_REVOKED',
          employeeId: benefit.employeeId,
          benefitType: benefit.benefitType,
        },
      },
    });

    return { success: true };
  }

  /**
   * Per-employee de minimis payable for one payroll period, keyed by userId.
   *
   * Assignments are stored monthly, so a semi-monthly run pays half. Amounts are
   * already capped on the way in, which is why nothing is re-clamped here.
   */
  async deMinimisTotalsForPeriod(
    tenantId: string,
    organizationId: string,
    userIds: string[],
    periodsInMonth: number,
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (userIds.length === 0) return totals;

    const benefits = await this.prisma.deMinimisBenefit.findMany({
      where: {
        tenantId,
        organizationId,
        employeeId: { in: userIds },
        isActive: true,
        deletedAt: null,
      },
      select: { employeeId: true, monthlyAmount: true },
    });

    const divisor = periodsInMonth > 0 ? periodsInMonth : 1;
    for (const b of benefits) {
      const perPeriod = Number(b.monthlyAmount) / divisor;
      totals.set(b.employeeId, (totals.get(b.employeeId) ?? 0) + perPeriod);
    }
    for (const [k, v] of totals) totals.set(k, round2(v));
    return totals;
  }
}

export { DeMinimisType };
