import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditAction, PayrollPeriodStatus, Prisma, EmploymentType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { IDEMPOTENCY_TTL_MS } from '../../common/constants';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePayrollPeriodDto, ExportPayrollDto, PayrollPeriodQuery } from './dto';

export interface PayrollExportJobData {
  tenantId: string;
  organizationId: string;
  periodId?: string;
  format: 'PDF' | 'CSV' | 'XLSX' | 'BOTH';
  actorId: string;
}

/** Overtime threshold: hours per period beyond which additional hours count as OT. */
const OVERTIME_DAILY_THRESHOLD_HOURS = 8;
/** Work days in a payroll half-period (for OT calculation baseline). */
const HALF_PERIOD_WORK_DAYS = 13;

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue('payroll-export') private readonly exportQueue: Queue<PayrollExportJobData>,
  ) {}

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

    const period = await this.prisma.payrollPeriod.create({
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

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'payroll_period',
        entityId: period.id,
        metadata: { action: 'createPeriod', type: dto.type, startDate, endDate },
      },
    }).catch(() => {});

    return period;
  }

  /**
   * Compute payroll line items from Supervisor-approved timesheets in this period.
   * Only payroll_eligible = true AND status = ACTIVE users are included (BR-PAY-05).
   * Approved hours (status APPROVED or the optional PAYROLL_READY marker) count
   * toward estimated pay (BR-PAY-01) — matching the APPROVED/PAYROLL_READY
   * "counts as approved" convention used everywhere else in the codebase
   * (dashboard, reports, performance, supervisor stats). A supervisor's
   * approval decision (ApprovalsService.decide) sets status='APPROVED'; that
   * alone must be sufficient for the timesheet to appear here — the optional
   * markPayrollReady step is not a prerequisite for visibility.
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

    // Gather all Supervisor-approved timesheets within the period date range.
    // APPROVED is the status ApprovalsService.decide() sets on approval; PAYROLL_READY
    // is the optional downstream marker (markPayrollReady) — both count as "approved"
    // here so approval alone is enough for the record to reach this queue.
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: { in: ['APPROVED', 'PAYROLL_READY'] },
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

    // Filter: only payroll-eligible, active users (BR-PAY-05) and exclude interns
    const eligibleUsers = await this.prisma.user.findMany({
      where: {
        id: { in: [...allUserIds] },
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        payrollEligible: true,
        status: 'ACTIVE',
        employmentType: { not: 'INTERN' },
        deletedAt: null,
      },
      select: { id: true, hourlyRate: true },
    });

    // Create the payroll report + line items in a transaction
    const overtimeThresholdMinutes =
      OVERTIME_DAILY_THRESHOLD_HOURS * HALF_PERIOD_WORK_DAYS * 60;

    const report = await this.prisma.$transaction(async (tx) => {
      // Delete any existing report for this period (re-generation). PayrollLineItem
      // has no cascade delete on payrollReportId, so the child rows must be removed
      // before the parent report or this violates the FK constraint.
      const existingReports = await tx.payrollReport.findMany({
        where: { payrollPeriodId: periodId, tenantId: p.tenantId },
        select: { id: true },
      });
      if (existingReports.length > 0) {
        await tx.payrollLineItem.deleteMany({
          where: { payrollReportId: { in: existingReports.map((r) => r.id) } },
        });
        await tx.payrollReport.deleteMany({
          where: { payrollPeriodId: periodId, tenantId: p.tenantId },
        });
      }

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
    const updated = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'payroll_period',
        entityId: periodId,
        metadata: { action: 'lockPeriod' },
      },
    }).catch(() => {});

    return updated;
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

    void Promise.all(
      report.lineItems.map((item) =>
        this.notifications.create({
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: item.userId,
          senderId: p.userId,
          type: 'PAYROLL_READY',
          category: 'PAYROLL',
          title: 'Payslip available',
          message: 'Your payslip for this period is ready to view.',
          actionUrl: '/payslips',
          actionLabel: 'View Payslip',
        }),
      ),
    ).catch((err: unknown) => console.error('[PayrollService] Payslip notification fan-out failed:', err));

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
              select: { firstName: true, lastName: true, email: true, employmentType: true, jobTitle: true, department: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!report) throw new NotFoundException('Payroll report not found');
    return report;
  }

  /** The current report for a period (if generated yet), for the Payroll Processing wizard — read-only, never regenerates. */
  async findReportByPeriod(p: AuthPrincipal, periodId: string) {
    await this.findOnePeriod(p, periodId); // 404s if the period doesn't exist / isn't in this org
    return this.prisma.payrollReport.findFirst({
      where: { payrollPeriodId: periodId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        lineItems: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true, employmentType: true, jobTitle: true, department: { select: { name: true } } },
            },
          },
        },
      },
    });
  }

  /**
   * Marks the discrepant line items (rejectedHours > 0) on a report as flagged for
   * follow-up: writes an audit trail entry and notifies the affected employees.
   * Discrepancy status itself is derived from rejectedHours, not a stored flag —
   * this action's purpose is the audit/notification trail, not changing the status.
   */
  async flagDiscrepancies(p: AuthPrincipal, reportId: string) {
    if (!this.can(p, PERMISSIONS.PAYROLL_GENERATE)) {
      throw new ForbiddenException('Only HR/Finance/Admin can flag payroll discrepancies');
    }
    const report = await this.prisma.payrollReport.findFirst({
      where: { id: reportId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: { lineItems: { where: { rejectedHours: { gt: 0 } } } },
    });
    if (!report) throw new NotFoundException('Payroll report not found');

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'payroll_report',
        entityId: report.id,
        metadata: { event: 'PAYROLL_DISCREPANCY_FLAGGED', affectedUserIds: report.lineItems.map((li) => li.userId) },
      },
    });

    await Promise.all(
      report.lineItems.map((item) =>
        this.notifications.create({
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: item.userId,
          senderId: p.userId,
          type: 'ANNOUNCEMENT',
          category: 'PAYROLL',
          title: 'Payroll discrepancy flagged',
          message: 'HR flagged a discrepancy on your timesheet hours for this payroll period — it is under review.',
          actionUrl: '/payslips',
          actionLabel: 'View Payslip',
        }),
      ),
    );

    return { flaggedCount: report.lineItems.length };
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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { hourlyRate: rate, updatedBy: p.userId, version: { increment: 1 } },
      select: { id: true, firstName: true, lastName: true, hourlyRate: true, version: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'user',
        entityId: userId,
        metadata: { action: 'updateRate', previousRate: user.hourlyRate, newRate: rate },
      },
    }).catch(() => {});

    return updated;
  }

  async getDashboard(p: AuthPrincipal) {
    if (!this.can(p, PERMISSIONS.PAYROLL_READ)) {
      throw new ForbiddenException('Only Finance/Admin can view the payroll dashboard');
    }

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: {
        reports: {
          include: {
            lineItems: {
              include: {
                user: {
                  select: {
                    department: { select: { id: true, name: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

    let totalPayroll = 0;
    let totalPayrollTrend = '+0.0%';
    const reportsWithTotals = periods
      .flatMap(per => per.reports)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (reportsWithTotals.length > 0) {
      const latestReport = reportsWithTotals[0];
      const totalsObj = latestReport.totals as { totalEstimatedPay?: string } | null;
      totalPayroll = Number(totalsObj?.totalEstimatedPay ?? 0);

      if (reportsWithTotals.length > 1) {
        const prevReport = reportsWithTotals[1];
        const prevTotalsObj = prevReport.totals as { totalEstimatedPay?: string } | null;
        const prevVal = Number(prevTotalsObj?.totalEstimatedPay ?? 0);
        if (prevVal > 0) {
          const change = ((totalPayroll - prevVal) / prevVal) * 100;
          totalPayrollTrend = (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
        }
      }
    }

    const activePayrunsCount = periods.filter(per => ['OPEN', 'GENERATED', 'LOCKED'].includes(per.status)).length;

    const pendingHRApprovals = await this.prisma.timesheet.count({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        deletedAt: null,
      }
    });

    let payEfficiency = 100.0;
    let payEfficiencyTrend = '+0.0%';
    if (reportsWithTotals.length > 0) {
      const latestReport = reportsWithTotals[0];
      const approvedSum = latestReport.lineItems.reduce((acc, item) => acc + Number(item.approvedHours), 0);
      const pendingSum = latestReport.lineItems.reduce((acc, item) => acc + Number(item.pendingHours), 0);
      const totalHours = approvedSum + pendingSum;
      if (totalHours > 0) {
        payEfficiency = (approvedSum / totalHours) * 100;
      }

      if (reportsWithTotals.length > 1) {
        const prevReport = reportsWithTotals[1];
        const prevApprovedSum = prevReport.lineItems.reduce((acc, item) => acc + Number(item.approvedHours), 0);
        const prevPendingSum = prevReport.lineItems.reduce((acc, item) => acc + Number(item.pendingHours), 0);
        const prevTotalHours = prevApprovedSum + prevPendingSum;
        let prevEfficiency = 100.0;
        if (prevTotalHours > 0) {
          prevEfficiency = (prevApprovedSum / prevTotalHours) * 100;
        }
        const change = payEfficiency - prevEfficiency;
        payEfficiencyTrend = (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
      }
    }

    const activeRuns: any[] = [];
    const activePeriods = periods.filter(per => ['OPEN', 'GENERATED', 'LOCKED', 'EXPORTED'].includes(per.status)).slice(0, 10);

    for (const per of activePeriods) {
      let uiStatus = 'Pending';
      if (per.status === 'EXPORTED') uiStatus = 'Completed';
      else if (per.status === 'GENERATED' || per.status === 'LOCKED') uiStatus = 'Processing';

      const deptSplits = new Map<string, number>();
      
      if (per.reports.length > 0 && per.reports[0].lineItems.length > 0) {
        for (const item of per.reports[0].lineItems) {
          const deptName = item.user.department?.name ?? 'Operations';
          deptSplits.set(deptName, (deptSplits.get(deptName) ?? 0) + Number(item.estimatedPay));
        }
      } else {
        const users = await this.prisma.user.findMany({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollEligible: true,
            status: 'ACTIVE',
            employmentType: { not: 'INTERN' },
            deletedAt: null,
          },
          include: { department: { select: { name: true } } },
        });

        const timesheets = await this.prisma.timesheet.findMany({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            status: 'PAYROLL_READY',
            deletedAt: null,
            periodStart: { gte: per.startDate },
            periodEnd: { lte: per.endDate },
          },
        });

        for (const u of users) {
          const userTimesheets = timesheets.filter(ts => ts.userId === u.id);
          const totalMins = userTimesheets.reduce((acc, ts) => acc + ts.totalMinutes, 0);
          const hours = totalMins / 60;
          const rate = Number(u.hourlyRate ?? 0);
          const estPay = hours * rate;
          const deptName = u.department?.name ?? 'Operations';
          deptSplits.set(deptName, (deptSplits.get(deptName) ?? 0) + estPay);
        }
      }

      if (deptSplits.size === 0) {
        deptSplits.set('Operations', 0);
      }

      for (const [deptName, grossTotal] of deptSplits.entries()) {
        activeRuns.push({
          id: per.id,
          startDate: per.startDate,
          endDate: per.endDate,
          type: per.type,
          department: deptName,
          grossTotal,
          status: uiStatus,
        });
      }
    }

    return {
      cards: {
        totalPayroll: { value: totalPayroll, trend: totalPayrollTrend },
        activePayruns: { value: activePayrunsCount },
        pendingHRApprovals: { value: pendingHRApprovals, label: 'Requires immediate action' },
        payEfficiency: { value: Number(payEfficiency.toFixed(1)), trend: payEfficiencyTrend },
      },
      activeRuns,
    };
  }

  async getDistribution(p: AuthPrincipal) {
    if (!this.can(p, PERMISSIONS.PAYROLL_READ)) {
      throw new ForbiddenException('Only Finance/Admin can view payroll distribution');
    }

    const latestReport = await this.prisma.payrollReport.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: {
          include: {
            user: {
              select: {
                department: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    if (!latestReport || latestReport.lineItems.length === 0) {
      return {
        totalSpend: 0,
        departments: [
          { name: 'Engineering & Design', value: 35, amount: 0 },
          { name: 'Sales & Marketing', value: 25, amount: 0 },
          { name: 'Executive Management', value: 20, amount: 0 },
          { name: 'Product Support', value: 20, amount: 0 },
        ],
      };
    }

    const deptAmounts = new Map<string, number>();
    let totalSpend = 0;

    for (const item of latestReport.lineItems) {
      const deptName = item.user.department?.name ?? 'Operations';
      const amt = Number(item.estimatedPay);
      deptAmounts.set(deptName, (deptAmounts.get(deptName) ?? 0) + amt);
      totalSpend += amt;
    }

    const departmentsList = Array.from(deptAmounts.entries()).map(([name, amount]) => {
      const percentage = totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0;
      return { name, value: percentage, amount };
    });

    return {
      totalSpend,
      departments: departmentsList.sort((a, b) => b.amount - a.amount),
    };
  }

  async queueExport(
    p: AuthPrincipal,
    format: 'PDF' | 'CSV' | 'XLSX',
    periodId?: string,
  ) {
    if (!this.can(p, PERMISSIONS.PAYROLL_EXPORT)) {
      throw new ForbiddenException('Only Finance/Admin can export payroll reports');
    }

    const jobId = randomUUID();
    await this.exportQueue.add(
      'export',
      {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        periodId,
        format: format as any,
        actorId: p.userId,
      },
      { jobId, attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
    );

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.PAYROLL_EXPORT,
        entityType: 'payroll_period',
        entityId: periodId || null,
        metadata: { jobId, format },
      },
    });

    return { jobId };
  }

  // -- Finance Payroll Processing (validate/approve/reject/send-to-bank pipeline) --
  // Distinct from the HR-facing generate/lock/export wizard above: this is the Finance-only
  // review pipeline gated by PAYROLL_VALIDATE/APPROVE/REJECT/SEND_TO_BANK permissions, which
  // only the FINANCE role (and ADMIN via wildcard) holds — see packages/shared/src/permissions.ts.

  async getProcessingDashboard(p: AuthPrincipal, periodId: string) {
    const period = await this.findOnePeriod(p, periodId);

    const report = await this.prisma.payrollReport.findFirst({
      where: { payrollPeriodId: periodId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        lineItems: {
          include: {
            user: {
              select: {
                id: true, firstName: true, lastName: true, email: true,
                jobTitle: true, employmentType: true, hourlyRate: true,
                payrollEligible: true, status: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const lineItems = report?.lineItems ?? [];

    let grossPayroll = 0;
    let totalHours = 0;

    const employees = lineItems.map((li) => {
      const estimatedPay = Number(li.estimatedPay);
      grossPayroll += estimatedPay;
      totalHours += Number(li.approvedHours) + Number(li.overtimeHours);
      const baseRate = Number(li.hourlyRate);
      const approvedHrs = Number(li.approvedHours);
      const overtimeHrs = Number(li.overtimeHours);
      const totalHrs = approvedHrs + overtimeHrs;
      const payMultiplier = baseRate > 0 && totalHrs > 0
        ? Number((estimatedPay / (totalHrs * baseRate)).toFixed(2))
        : 1;

      let status: string;
      if (Number(li.rejectedHours) > 0) {
        status = 'Action Required';
      } else if (period.processingStatus === 'PENDING_APPROVAL' || period.processingStatus === 'APPROVED') {
        status = 'Pending Approval';
      } else {
        status = 'Ready';
      }

      return {
        id: li.user.id,
        firstName: li.user.firstName,
        lastName: li.user.lastName,
        email: li.user.email,
        jobTitle: li.user.jobTitle,
        employmentType: li.user.employmentType,
        department: li.user.department,
        hourlyRate: baseRate,
        payrollEligible: li.user.payrollEligible,
        status: li.user.status,
        estimatedPay,
        approvedHours: approvedHrs,
        pendingHours: Number(li.pendingHours),
        overtimeHours: overtimeHrs,
        payMultiplier,
        rowStatus: status,
        rejectedHours: Number(li.rejectedHours),
        lineItemId: li.id,
      };
    });

    const estimatedTax = grossPayroll * 0.15;

    const auditLogRaw = await this.prisma.auditLog.findMany({
      where: {
        tenantId: p.tenantId,
        entityType: 'payroll_period',
        entityId: periodId,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const actorIds = [...new Set(auditLogRaw.map((e) => e.actorId).filter(Boolean) as string[])];
    const actors = actorIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, tenantId: p.tenantId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

    const nextDeadline = await this.getNextDeadline(p);

    return {
      grossPayroll,
      totalEmployees: employees.length,
      estimatedTax,
      periodId: period.id,
      periodLabel: `${period.startDate.toISOString().slice(0, 10)} - ${period.endDate.toISOString().slice(0, 10)}`,
      periodStatus: period.status,
      processingStatus: period.processingStatus,
      nextDeadline,
      employees,
      auditLog: auditLogRaw.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorName: entry.actorId ? (actorMap.get(entry.actorId) ?? null) : null,
        createdAt: entry.createdAt.toISOString(),
        metadata: entry.metadata as Record<string, unknown> | null,
      })),
    };
  }

  async getPayrollEmployees(p: AuthPrincipal) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        payrollEligible: true,
        status: 'ACTIVE',
        employmentType: { not: 'INTERN' },
        deletedAt: null,
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        jobTitle: true, employmentType: true, hourlyRate: true,
        payrollEligible: true, status: true,
        department: { select: { name: true } },
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      jobTitle: u.jobTitle,
      employmentType: u.employmentType,
      department: u.department,
      hourlyRate: Number(u.hourlyRate ?? 0),
      payrollEligible: u.payrollEligible,
      status: u.status,
    }));
  }

  async getPayrollAuditLog(p: AuthPrincipal) {
    const auditLogRaw = await this.prisma.auditLog.findMany({
      where: {
        tenantId: p.tenantId,
        entityType: 'payroll_period',
        action: { in: ['PAYROLL_VALIDATED', 'PAYROLL_APPROVED', 'PAYROLL_REJECTED', 'PAYROLL_SENT_TO_BANK', 'PAYROLL_EXPORT'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const actorIds = [...new Set(auditLogRaw.map((e) => e.actorId).filter(Boolean) as string[])];
    const actors = actorIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, tenantId: p.tenantId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

    return auditLogRaw.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorName: entry.actorId ? (actorMap.get(entry.actorId) ?? null) : null,
      createdAt: entry.createdAt.toISOString(),
      metadata: entry.metadata as Record<string, unknown> | null,
    }));
  }

  async getNextDeadline(p: AuthPrincipal) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const firstHalfEnd = new Date(currentYear, currentMonth, 15);
    const secondHalfEnd = new Date(currentYear, currentMonth + 1, 0);
    secondHalfEnd.setHours(23, 59, 59, 999);

    if (now <= firstHalfEnd) {
      return { label: 'First Half Deadline', date: firstHalfEnd.toISOString() };
    } else {
      return { label: 'Second Half Deadline', date: secondHalfEnd.toISOString() };
    }
  }

  async validatePayroll(p: AuthPrincipal, periodId: string, idempotencyKey: string) {
    const period = await this.findOnePeriod(p, periodId);

    const idemKey = `payroll-validate:${idempotencyKey}`;
    const cached = await this.checkIdempotency(p.tenantId, idemKey);
    if (cached) {
      const cachedPeriod = await this.findOnePeriod(p, periodId);
      return { periodId, processingStatus: cachedPeriod.processingStatus };
    }

    const fromRejected = period.processingStatus === 'REJECTED';
    if (period.processingStatus !== 'DRAFT' && period.processingStatus !== 'VALIDATING' && !fromRejected) {
      throw new ConflictException(`Cannot validate payroll with processing status ${period.processingStatus}. Must be DRAFT.`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          processingStatus: 'VALIDATED',
          validatedAt: new Date(),
          validatedBy: p.userId,
          updatedBy: p.userId,
          version: { increment: 1 },
          ...(fromRejected ? { rejectedAt: null, rejectedBy: null, rejectionReason: null } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'PAYROLL_VALIDATED',
          entityType: 'payroll_period',
          entityId: periodId,
          metadata: { previousStatus: period.processingStatus },
        },
      });

      return updated;
    });

    await this.saveIdempotency(p.tenantId, idemKey, result.id);
    return { periodId, processingStatus: result.processingStatus };
  }

  async approvePayroll(p: AuthPrincipal, periodId: string, idempotencyKey: string) {
    const period = await this.findOnePeriod(p, periodId);

    const idemKey = `payroll-approve:${idempotencyKey}`;
    const cached = await this.checkIdempotency(p.tenantId, idemKey);
    if (cached) {
      const cachedPeriod = await this.findOnePeriod(p, periodId);
      return { periodId, processingStatus: cachedPeriod.processingStatus };
    }

    if (period.processingStatus !== 'VALIDATED' && period.processingStatus !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Cannot approve payroll with processing status ${period.processingStatus}. Must be VALIDATED first.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          processingStatus: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: p.userId,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'PAYROLL_APPROVED',
          entityType: 'payroll_period',
          entityId: periodId,
          metadata: { previousStatus: period.processingStatus },
        },
      });

      return updated;
    });

    await this.saveIdempotency(p.tenantId, idemKey, result.id);
    return { periodId, processingStatus: result.processingStatus };
  }

  async rejectPayroll(p: AuthPrincipal, periodId: string, reason: string, idempotencyKey: string) {
    const period = await this.findOnePeriod(p, periodId);

    const idemKey = `payroll-reject:${idempotencyKey}`;
    const cached = await this.checkIdempotency(p.tenantId, idemKey);
    if (cached) {
      const cachedPeriod = await this.findOnePeriod(p, periodId);
      return { periodId, processingStatus: cachedPeriod.processingStatus };
    }

    if (period.processingStatus !== 'VALIDATED' && period.processingStatus !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Cannot reject payroll with processing status ${period.processingStatus}. Must be VALIDATED first.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          processingStatus: 'REJECTED',
          rejectedAt: new Date(),
          rejectedBy: p.userId,
          rejectionReason: reason,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'PAYROLL_REJECTED',
          entityType: 'payroll_period',
          entityId: periodId,
          metadata: { previousStatus: period.processingStatus, reason },
        },
      });

      return updated;
    });

    await this.saveIdempotency(p.tenantId, idemKey, result.id);
    return { periodId, processingStatus: result.processingStatus };
  }

  async sendToBank(p: AuthPrincipal, periodId: string, idempotencyKey: string) {
    const period = await this.findOnePeriod(p, periodId);

    const idemKey = `payroll-send-to-bank:${idempotencyKey}`;
    const cached = await this.checkIdempotency(p.tenantId, idemKey);
    if (cached) {
      const cachedPeriod = await this.findOnePeriod(p, periodId);
      return { periodId, processingStatus: cachedPeriod.processingStatus };
    }

    if (period.processingStatus !== 'APPROVED') {
      throw new ConflictException(
        `Cannot send payroll to bank with processing status ${period.processingStatus}. Must be APPROVED first.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          processingStatus: 'SENT_TO_BANK',
          sentToBankAt: new Date(),
          sentToBankBy: p.userId,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'PAYROLL_SENT_TO_BANK',
          entityType: 'payroll_period',
          entityId: periodId,
          metadata: { previousStatus: period.processingStatus },
        },
      });

      return updated;
    });

    await this.saveIdempotency(p.tenantId, idemKey, result.id);

    void Promise.all(
      (await this.prisma.payrollLineItem.findMany({
        where: { payrollReport: { payrollPeriodId: periodId }, tenantId: p.tenantId },
        select: { userId: true },
      })).map((item) =>
        this.notifications.create({
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: item.userId,
          senderId: p.userId,
          type: 'PAYROLL_READY',
          category: 'PAYROLL',
          title: 'Payroll sent to bank',
          message: 'Your payment has been initiated. Check your account for details.',
          actionUrl: '/payslips',
          actionLabel: 'View Details',
        }),
      ),
    ).catch((err: unknown) => this.logger.error('Send-to-bank notification fan-out failed:', err));

    return { periodId, processingStatus: result.processingStatus };
  }

  // -- Private helpers --

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }
}
