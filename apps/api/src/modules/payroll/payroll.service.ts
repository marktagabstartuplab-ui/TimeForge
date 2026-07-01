import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditAction, PayrollPeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import { CreatePayrollPeriodDto, ExportPayrollDto, PayrollPeriodQuery } from './dto';

/** Overtime threshold: hours per period beyond which additional hours count as OT. */
const OVERTIME_DAILY_THRESHOLD_HOURS = 8;
/** Work days in a payroll half-period (for OT calculation baseline). */
const HALF_PERIOD_WORK_DAYS = 13;
/** M2: idempotency key TTL, matches the AI/Admin money-mutation pattern. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -- Idempotency helpers (M2) --
  // Mirrors AdminService/AiService: a resultRef (opaque string) is cached per
  // tenant+key for 24h so retried requests with the same Idempotency-Key don't
  // reprocess a money mutation.

  private async checkIdempotency(tenantId: string, key: string): Promise<string | null> {
    const existing = await (this.prisma as any).idempotencyKey.findFirst({
      where: { tenantId, key, expiresAt: { gt: new Date() } },
    });
    return existing?.resultRef ?? null;
  }

  private async saveIdempotency(tenantId: string, key: string, resultRef: string): Promise<void> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
    await (this.prisma as any).idempotencyKey
      .upsert({
        where: { tenantId_key: { tenantId, key } } as any,
        update: { resultRef, expiresAt },
        create: { tenantId, key, resultRef, expiresAt },
      })
      .catch((err: Error) => this.logger.warn(`Idempotency persist failed: ${err.message}`));
  }

  // -- Payroll Periods --

  async findAllPeriods(p: AuthPrincipal, query: PayrollPeriodQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.PayrollPeriodWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status as PayrollPeriodStatus } : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.payrollPeriod.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  async findOnePeriod(p: AuthPrincipal, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    return period;
  }

  async createPeriod(p: AuthPrincipal, dto: CreatePayrollPeriodDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new UnprocessableEntityException('startDate and endDate must be valid dates');
    }
    if (endDate < startDate) {
      throw new UnprocessableEntityException('endDate must be after or equal to startDate');
    }

    const conflict = await this.prisma.payrollPeriod.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        startDate,
        endDate,
        deletedAt: null,
      },
    });
    if (conflict) throw new ConflictException('A payroll period for these exact dates already exists');

    return this.prisma.payrollPeriod.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        type: dto.type,
        status: 'OPEN',
        startDate,
        endDate,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  /**
   * Compute payroll line items from PAYROLL_READY timesheets in this period.
   * Only payroll_eligible = true AND status = ACTIVE users are included (BR-PAY-05).
   * Only PAYROLL_READY hours count toward estimated pay (BR-PAY-01).
   *
   * M2: an Idempotency-Key is required by the controller; a retried request with
   * the same key returns the previously-generated report instead of reprocessing.
   */
  async generateReport(p: AuthPrincipal, periodId: string, idempotencyKey: string) {
    const period = await this.findOnePeriod(p, periodId);
    if (period.status === 'EXPORTED') {
      throw new ConflictException('Payroll period is already exported and locked (BR-PAY-04)');
    }

    // M2: if this exact key was already processed, return the cached report untouched.
    const idemKey = `payroll-generate:${idempotencyKey}`;
    const cachedReportId = await this.checkIdempotency(p.tenantId, idemKey);
    if (cachedReportId) {
      const cachedReport = await this.prisma.payrollReport.findFirst({
        where: { id: cachedReportId, tenantId: p.tenantId, payrollPeriodId: periodId },
        include: { lineItems: true },
      });
      if (cachedReport) return cachedReport;
    }

    // Gather all PAYROLL_READY timesheets within the period date range
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'PAYROLL_READY',
        deletedAt: null,
        periodStart: { gte: period.startDate },
        periodEnd: { lte: period.endDate },
      },
      select: { userId: true, totalMinutes: true },
    });

    // Aggregate approved minutes per user
    const userMinutes = new Map<string, number>();
    for (const ts of timesheets) {
      userMinutes.set(ts.userId, (userMinutes.get(ts.userId) ?? 0) + ts.totalMinutes);
    }

    // Gather all SUBMITTED / UNDER_REVIEW / REVISION_REQUESTED timesheets (pending)
    const pendingTimesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED'] },
        deletedAt: null,
        periodStart: { gte: period.startDate },
        periodEnd: { lte: period.endDate },
      },
      select: { userId: true, totalMinutes: true },
    });
    const pendingMinutes = new Map<string, number>();
    for (const ts of pendingTimesheets) {
      pendingMinutes.set(ts.userId, (pendingMinutes.get(ts.userId) ?? 0) + ts.totalMinutes);
    }

    // Gather REJECTED timesheets
    const rejectedTimesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'REJECTED',
        deletedAt: null,
        periodStart: { gte: period.startDate },
        periodEnd: { lte: period.endDate },
      },
      select: { userId: true, totalMinutes: true },
    });
    const rejectedMinutes = new Map<string, number>();
    for (const ts of rejectedTimesheets) {
      rejectedMinutes.set(ts.userId, (rejectedMinutes.get(ts.userId) ?? 0) + ts.totalMinutes);
    }

    // All unique user IDs touched (for rate lookup)
    const allUserIds = new Set([
      ...userMinutes.keys(),
      ...pendingMinutes.keys(),
      ...rejectedMinutes.keys(),
    ]);

    // Filter: only payroll-eligible, active users (BR-PAY-05)
    const eligibleUsers = await this.prisma.user.findMany({
      where: {
        id: { in: [...allUserIds] },
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        payrollEligible: true,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, hourlyRate: true },
    });

    // Create the payroll report + line items in a transaction
    const overtimeThresholdMinutes =
      OVERTIME_DAILY_THRESHOLD_HOURS * HALF_PERIOD_WORK_DAYS * 60;

    const report = await this.prisma.$transaction(async (tx) => {
      // Delete existing report for this period (re-generation)
      await tx.payrollReport.deleteMany({
        where: {
          payrollPeriodId: periodId,
          tenantId: p.tenantId,
        },
      });

      const newReport = await tx.payrollReport.create({
        data: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          payrollPeriodId: periodId,
          generatedBy: p.userId,
          createdBy: p.userId,
          updatedBy: p.userId,
        },
      });

      let totalEstimatedPay = new Decimal(0);

      for (const user of eligibleUsers) {
        const rate = user.hourlyRate ?? new Decimal(0);
        const approvedMins = userMinutes.get(user.id) ?? 0;
        const pendingMins = pendingMinutes.get(user.id) ?? 0;
        const rejectedMins = rejectedMinutes.get(user.id) ?? 0;

        const approvedHours = new Decimal(approvedMins).div(60);
        const pendingHours = new Decimal(pendingMins).div(60);
        const rejectedHours = new Decimal(rejectedMins).div(60);

        // Overtime = approved minutes beyond the half-period threshold
        const overtimeMins = Math.max(0, approvedMins - overtimeThresholdMinutes);
        const regularMins = approvedMins - overtimeMins;

        const overtimeHours = new Decimal(overtimeMins).div(60);
        const regularHours = new Decimal(regularMins).div(60);

        // Estimated pay: regular x rate + overtime x rate x 1.25
        const estimatedPay = regularHours.mul(rate).add(overtimeHours.mul(rate).mul(1.25));

        totalEstimatedPay = totalEstimatedPay.add(estimatedPay);

        await tx.payrollLineItem.create({
          data: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReportId: newReport.id,
            userId: user.id,
            approvedHours,
            pendingHours,
            rejectedHours,
            overtimeHours,
            hourlyRate: rate,
            estimatedPay,
            createdBy: p.userId,
            updatedBy: p.userId,
          },
        });
      }

      // Update report totals and period status
      await tx.payrollReport.update({
        where: { id: newReport.id },
        data: {
          totals: {
            headcount: eligibleUsers.length,
            totalEstimatedPay: totalEstimatedPay.toFixed(2),
          },
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'GENERATED',
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      return tx.payrollReport.findUniqueOrThrow({
        where: { id: newReport.id },
        include: { lineItems: true },
      });
    });

    await this.saveIdempotency(p.tenantId, idemKey, report.id);

    return report;
  }

  async lockPeriod(p: AuthPrincipal, periodId: string) {
    const period = await this.findOnePeriod(p, periodId);
    if (period.status !== 'GENERATED') {
      throw new ConflictException(
        `Cannot lock a payroll period with status ${period.status}. Generate first.`,
      );
    }
    return this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Export the payroll report (MVP: synchronous -- returns the report data directly).
   * In production, this would queue a BullMQ job and return a 202.
   *
   * H1: requires the period be LOCKED (immutable-after-export, BR-PAY-04), rejects
   * a repeat export of an already-EXPORTED period, and writes an
   * AuditLog(PAYROLL_EXPORT) entry. M2: idempotent on Idempotency-Key retries.
   */
  async exportReport(
    p: AuthPrincipal,
    periodId: string,
    dto: ExportPayrollDto,
    idempotencyKey: string,
  ) {
    const period = await this.findOnePeriod(p, periodId);

    if (period.status === 'EXPORTED') {
      throw new ConflictException('Payroll period has already been exported (BR-PAY-04)');
    }
    if (period.status !== 'LOCKED') {
      throw new ConflictException(
        `Payroll period must be LOCKED before export (current status: ${period.status}). Generate and lock it first.`,
      );
    }

    // M2: replay-safe on retries with the same Idempotency-Key.
    const idemKey = `payroll-export:${idempotencyKey}`;
    const cached = await this.checkIdempotency(p.tenantId, idemKey);
    if (cached) {
      try {
        const { reportId, format } = JSON.parse(cached) as { reportId: string; format: string };
        const cachedReport = await this.findReport(p, reportId);
        return { reportId: cachedReport.id, format, status: 'COMPLETED', data: cachedReport };
      } catch {
        // corrupt cache entry -- fall through and reprocess
      }
    }

    const report = await this.prisma.payrollReport.findFirst({
      where: { payrollPeriodId: periodId, tenantId: p.tenantId, deletedAt: null },
      include: {
        lineItems: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true, employmentType: true },
            },
          },
        },
      },
    });
    if (!report) throw new NotFoundException('Payroll report not found -- generate first');

    // Mark exported + write the immutable audit trail entry (H1) in one transaction.
    await this.prisma.$transaction([
      this.prisma.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'EXPORTED',
          exportedAt: new Date(),
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: AuditAction.PAYROLL_EXPORT,
          entityType: 'payroll_period',
          entityId: periodId,
          metadata: { reportId: report.id, format: dto.format },
        },
      }),
    ]);

    await this.saveIdempotency(
      p.tenantId,
      idemKey,
      JSON.stringify({ reportId: report.id, format: dto.format }),
    );

    // MVP: return the report data directly (full async export is post-MVP)
    return {
      reportId: report.id,
      format: dto.format,
      status: 'COMPLETED',
      data: report,
    };
  }

  async findReport(p: AuthPrincipal, reportId: string) {
    const report = await this.prisma.payrollReport.findFirst({
      where: { id: reportId, tenantId: p.tenantId, deletedAt: null },
      include: {
        lineItems: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true, employmentType: true },
            },
          },
        },
      },
    });
    if (!report) throw new NotFoundException('Payroll report not found');
    return report;
  }

  /**
   * Employee self-endpoint: returns their own payroll status (hours buckets only, no amounts).
   * Amounts are Finance/Admin only (BR-PAY-06).
   */
  async getMyPayrollStatus(p: AuthPrincipal) {
    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: { userId: p.userId, tenantId: p.tenantId },
      select: {
        id: true,
        approvedHours: true,
        pendingHours: true,
        rejectedHours: true,
        overtimeHours: true,
        createdAt: true,
        payrollReport: {
          select: {
            payrollPeriodId: true,
            period: { select: { startDate: true, endDate: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return lineItems; // hourlyRate and estimatedPay are intentionally excluded
  }

  // -- Hourly Rate Management (Finance / Admin only) --

  async getRate(p: AuthPrincipal, userId: string) {
    if (!this.can(p, PERMISSIONS.PAYROLL_RATE_READ)) {
      throw new ForbiddenException('Hourly rate is Finance/Admin only (BR-PAY-06)');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, hourlyRate: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateRate(
    p: AuthPrincipal,
    userId: string,
    rate: number,
    version: number,
  ) {
    if (!this.can(p, PERMISSIONS.PAYROLL_RATE_UPDATE)) {
      throw new ForbiddenException('Only Finance/Admin can update hourly rates (BR-PAY-06)');
    }
    if (rate < 0) throw new UnprocessableEntityException('Hourly rate must be >= 0');

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.version !== version) throw new ConflictException('Version mismatch');

    return this.prisma.user.update({
      where: { id: userId },
      data: { hourlyRate: rate, updatedBy: p.userId, version: { increment: 1 } },
      select: { id: true, firstName: true, lastName: true, hourlyRate: true, version: true },
    });
  }

  // -- Private helpers --

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }
}
