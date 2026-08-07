import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditAction, PayrollPeriodStatus, Prisma, EmploymentType, CompensationType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { IDEMPOTENCY_TTL_MS } from '../../common/constants';
import { AuthPrincipal } from '../../common/decorators';
import { registerPdfFonts, PDF_FONT, PDF_FONT_BOLD } from '../../common/pdf/pdf-fonts';
import { PERMISSIONS, orgDayKey } from '@timeforge/shared';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { OvertimeRateService } from '../../common/payroll/overtime-rate.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../../infra/cache.service';
import {
  CreatePayrollPeriodDto,
  ExportPayrollDto,
  PayrollPeriodQuery,
  StatutoryExportQuery,
  StatutoryReportQuery,
} from './dto';
import { BirTaxService, round2 } from './bir-tax.service';
import { DeductionService, periodsPerMonth } from './deduction.service';
import { PayrollSettingsService, ResolvedPayrollSettings } from './payroll-settings.service';
import { CompensationBenefitsService } from './compensation-benefits.service';
import { dateKeysBetween, dateOnlyKey, nightShiftMinutes } from './premium-hours';
import { formatStatutoryId } from './statutory-ids';
import { defaultPeriodCutoff } from './payroll-period.scheduler';
import {
  AGENCY_ID_FIELD,
  buildContributionSheet,
  sheetToCsv,
  type StatutoryExportRow,
} from './statutory-export';

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
    private readonly cache: CacheService,
    private readonly timeZones: OrgTimeZoneService,
    private readonly overtimeRates: OvertimeRateService,
    private readonly payrollSettings: PayrollSettingsService,
    private readonly deductions: DeductionService,
    private readonly birTax: BirTaxService,
    private readonly compensationBenefits: CompensationBenefitsService,
    @InjectQueue('payroll-export') private readonly exportQueue: Queue<PayrollExportJobData>,
  ) {}

  private async invalidateFinanceCache(orgId: string) {
    await Promise.all([
      this.cache.del(`finance:dashboard:org:${orgId}`),
      this.cache.del(`finance:compliance:org:${orgId}`),
      this.cache.del(`finance:departments:org:${orgId}`),
      this.cache.del(`finance:trends:org:${orgId}:monthly`),
      this.cache.del(`finance:trends:org:${orgId}:quarterly`),
      this.cache.del(`finance:trends:org:${orgId}:yearly`),
    ]).catch((err) => this.logger.warn(`Failed to clear finance cache: ${err.message}`));
  }

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

  /**
   * Line items snapshot hourlyRate/estimatedPay at generation time. When payroll
   * was generated before a rate was configured, fall back to the employee's
   * current rate so payslip PDFs match the employee self-view.
   *
   * Gross is always derived from the same regular/overtime figures shown in the
   * breakdown (never read from the stored estimatedPay snapshot) — approvedHours
   * can be revised after estimatedPay was first computed (e.g. a timesheet
   * correction), and nothing recalculates that stored value when it does. Using
   * it directly for Gross Earnings let the payslip show a breakdown that didn't
   * sum to its own total.
   */
  private resolvePayslipEarnings(
    item: {
      compensationType?: CompensationType | null;
      hourlyRate: Decimal | number | null;
      dailyRate?: Decimal | number | null;
      daysWorked?: Decimal | number | null;
      approvedHours: Decimal | number;
      overtimeHours: Decimal | number;
      estimatedPay: Decimal | number | null;
    },
    userHourlyRate: Decimal | number | null,
    overtimeMultiplier: number,
    userDailyRate?: Decimal | number | null,
    userCompType?: CompensationType | null,
  ) {
    const approved = Number(item.approvedHours);
    const overtime = Number(item.overtimeHours);
    const regular = Math.max(0, approved - overtime);

    const compType = item.compensationType ?? userCompType ?? 'HOURLY';
    const snapshottedRate = Number(item.hourlyRate ?? 0);
    const currentRate = Number(userHourlyRate ?? 0);
    const rate = snapshottedRate > 0 ? snapshottedRate : currentRate;

    const snapshottedDailyRate = Number(item.dailyRate ?? 0);
    const currentDailyRate = Number(userDailyRate ?? 0);
    const dailyRate = snapshottedDailyRate > 0 ? snapshottedDailyRate : (currentDailyRate > 0 ? currentDailyRate : rate * 8);

    const daysWorked = Number(item.daysWorked ?? (approved / 8));
    const regularDays = regular / 8;

    const regPay = compType === 'DAILY' ? regularDays * dailyRate : regular * rate;
    const otPay = overtime * rate * overtimeMultiplier;
    const gross = regPay + otPay;

    return { compType, rate, dailyRate, daysWorked, regularDays, regular, overtime, regPay, otPay, gross };
  }

  /**
   * FEAT-3: holiday and night-shift premiums for one employee in one period.
   *
   * Premiums are *increments* over the base pay (a regular holiday at 2.00x adds
   * 1.00x, not 2.00x) because the hours worked that day are already paid once in
   * the regular/overtime figures. Adding the full multiplier would pay holiday
   * hours twice over.
   *
   * Both results are linear in `rate`, which is what lets the rate-change path
   * rescale a stored premium instead of re-reading every time entry.
   */
  private computePremiums(input: {
    rate: number;
    nightMinutes: number;
    holidayMinutesByDay: Map<string, number> | undefined;
    holidayByKey: Map<string, { type: string; name: string }>;
    restDayMinutes?: number;
    periodStart: Date;
    periodEnd: Date;
    hasWorkedHours: boolean;
    settings: ResolvedPayrollSettings;
  }) {
    const { rate, settings } = input;

    const nightHours = input.nightMinutes / 60;
    const nightDifferential = round2(nightHours * rate * (settings.nightShiftPremium - 1));

    const restDayMins = input.restDayMinutes ?? 0;
    const restDayHours = restDayMins / 60;
    const restDayPay = round2(restDayHours * rate * (settings.restDayWorkedRate - 1));

    let holidayHours = 0;
    let holidayPay = 0;
    for (const [dayKey, minutes] of input.holidayMinutesByDay ?? []) {
      const holiday = input.holidayByKey.get(dayKey);
      if (!holiday) continue;
      const multiplier =
        holiday.type === 'SPECIAL_NON_WORKING'
          ? settings.specialHolidayWorkedRate
          : settings.regularHolidayWorkedRate;
      const hours = minutes / 60;
      holidayHours += hours;
      holidayPay += hours * rate * (multiplier - 1);
    }

    // Unworked regular holidays are still paid (Labor Code art. 94). Only for
    // employees who worked at some point in the period — an employee with zero
    // approved hours has nothing to base a "regular daily wage" on and is far
    // more likely to be inactive than to be a holiday-only payout.
    if (input.hasWorkedHours && settings.regularHolidayUnworkedRate > 0) {
      const REGULAR_DAY_HOURS = 8;
      for (const dayKey of dateKeysBetween(input.periodStart, input.periodEnd)) {
        const holiday = input.holidayByKey.get(dayKey);
        if (!holiday || holiday.type !== 'REGULAR') continue;
        if ((input.holidayMinutesByDay?.get(dayKey) ?? 0) > 0) continue; // worked — already paid above
        holidayHours += REGULAR_DAY_HOURS;
        holidayPay += REGULAR_DAY_HOURS * rate * settings.regularHolidayUnworkedRate;
      }
    }

    return {
      nightDiffHours: round2(nightHours),
      nightDifferential,
      holidayHours: round2(holidayHours),
      holidayPay: round2(holidayPay),
      restDayHours: round2(restDayHours),
      restDayPay,
    };
  }

  /**
   * FEAT-3: turns one employee's earnings into the full Philippine payslip
   * figures — the three statutory contributions and BIR withholding.
   *
   * Takes the premiums as input rather than deriving them, so both the payroll
   * generation path and the rate-change recalculation path produce a line item
   * whose breakdown sums to its own totals.
   */
  private computeStatutoryFigures(input: {
    /** Regular + overtime pay for the period. */
    basePay: number;
    premiums: ReturnType<PayrollService['computePremiums']>;
    prior:
      | {
          grossTotal: Decimal | null;
          sssContribution: Decimal | null;
          philhealthContribution: Decimal | null;
          pagibigContribution: Decimal | null;
          incomeTaxWithheld: Decimal | null;
        }
      | undefined;
    periodsInMonth: number;
    settings: ResolvedPayrollSettings;
    brackets: Awaited<ReturnType<BirTaxService['getBrackets']>>;
    thirteenthMonth: boolean;
  }) {
    const { settings, brackets } = input;
    const { holidayHours, holidayPay, nightDiffHours, nightDifferential, restDayHours, restDayPay } = input.premiums;

    const grossTotal = round2(input.basePay + holidayPay + nightDifferential + restDayPay);

    // -- Statutory contributions. A 13th-month payout is a benefit, not
    // compensation for hours, so SSS/PhilHealth/Pag-IBIG are not assessed on it.
    const contributions = input.thirteenthMonth
      ? null
      : this.deductions.calculateAll(grossTotal, input.periodsInMonth, settings);

    const sssContribution = contributions?.sss.employee ?? 0;
    const philhealthContribution = contributions?.philhealth.employee ?? 0;
    const pagibigContribution = contributions?.pagibig.employee ?? 0;
    const employeeContributions = contributions?.employeeTotal ?? 0;

    // -- Taxable income. Mandatory contributions are deductible; a 13th-month
    // payout is exempt up to the statutory cap.
    const taxableThisPeriod = input.thirteenthMonth
      ? Math.max(0, grossTotal - settings.thirteenthMonthExemptionCap)
      : Math.max(0, grossTotal - employeeContributions);

    const priorGross = Number(input.prior?.grossTotal ?? 0);
    const priorContributions =
      Number(input.prior?.sssContribution ?? 0) +
      Number(input.prior?.philhealthContribution ?? 0) +
      Number(input.prior?.pagibigContribution ?? 0);
    const priorTaxable = Math.max(0, priorGross - priorContributions);
    const priorTaxWithheld = Number(input.prior?.incomeTaxWithheld ?? 0);

    // Regular payroll withholds against the table for its own frequency
    // (RR 11-2018), so tax appears from the first cutoff and stays level. A
    // 13th-month payout is a lump-sum benefit and keeps the cumulative annual
    // treatment — periodsPerYear 0 selects it.
    const tax = this.birTax.calculateIncomeTax(
      taxableThisPeriod,
      priorTaxable,
      priorTaxWithheld,
      brackets,
      input.thirteenthMonth ? 0 : input.periodsInMonth * 12,
    );

    const totalDeductions = round2(employeeContributions + tax.taxInThisPeriod);
    const netPay = round2(grossTotal - totalDeductions);

    return {
      holidayHours,
      nightDiffHours,
      restDayHours,
      nightDifferential,
      holidayPay,
      restDayPay,
      sssContribution,
      philhealthContribution,
      pagibigContribution,
      incomeTaxWithheld: tax.taxInThisPeriod,
      sssEmployerShare: contributions?.sss.employer ?? 0,
      philhealthEmployerShare: contributions?.philhealth.employer ?? 0,
      pagibigEmployerShare: contributions?.pagibig.employer ?? 0,
      grossTotal,
      totalDeductions,
      netPay,
      ytdTaxableIncome: tax.yearToDateTaxableIncome,
      ytdTaxWithheld: tax.yearToDateTax,
      isThirteenthMonth: input.thirteenthMonth,
    };
  }

  /**
   * Reprice an employee's line items in still-open periods after their hourly
   * rate changes.
   *
   * The FEAT-3 breakdown is repriced too, not just `estimatedPay`. Holiday and
   * night premiums are linear in the rate, so they are rescaled by the ratio of
   * new rate to the rate they were computed at — exact, and it avoids re-reading
   * every time entry. Contributions and withholding are then recomputed from the
   * new gross, because they are *not* linear (caps, floors and tax brackets).
   * Leaving them stale is what would let a payslip show a breakdown that does
   * not sum to its own net pay.
   */
  private async recalculateOpenLineItemsForUser(
    p: AuthPrincipal,
    userId: string,
    compInfo: {
      compensationType: CompensationType;
      hourlyRate: number;
      dailyRate: number;
      daysPerWeek: number;
    },
    actorId: string,
    overtimeMultiplier: number,
  ) {
    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        userId,
        payrollReport: {
          period: { status: { in: ['OPEN', 'GENERATED'] } },
        },
      },
      select: {
        id: true,
        approvedHours: true,
        overtimeHours: true,
        hourlyRate: true,
        dailyRate: true,
        holidayHours: true,
        holidayPay: true,
        nightDiffHours: true,
        nightDifferential: true,
        restDayHours: true,
        restDayPay: true,
        isThirteenthMonth: true,
        deMinimisTotal: true,
        payrollReport: { select: { period: { select: { type: true, startDate: true } } } },
      },
    });
    if (lineItems.length === 0) return;

    const settings = await this.payrollSettings.forPrincipal(p);
    const brackets = await this.birTax.getBrackets(settings.birTaxTableYear);

    for (const li of lineItems) {
      const approved = Number(li.approvedHours);
      const overtime = Number(li.overtimeHours);
      const regular = Math.max(0, approved - overtime);

      let regularPay = 0;
      const daysWorked = approved / 8;

      if (compInfo.compensationType === 'DAILY') {
        const regularDays = regular / 8;
        regularPay = regularDays * compInfo.dailyRate;
      } else {
        regularPay = regular * compInfo.hourlyRate;
      }

      const overtimePay = overtime * compInfo.hourlyRate * overtimeMultiplier;
      const estimatedPay = regularPay + overtimePay;

      const oldRate = Number(li.hourlyRate);
      const ratio = oldRate > 0 ? compInfo.hourlyRate / oldRate : 0;
      const premiums = {
        holidayHours: Number(li.holidayHours),
        holidayPay: round2(Number(li.holidayPay) * ratio),
        nightDiffHours: Number(li.nightDiffHours),
        nightDifferential: round2(Number(li.nightDifferential) * ratio),
        // Rest-day premium rescales with the rate exactly like the other two —
        // omitting it here would silently zero it out of the recomputed totals.
        restDayHours: Number(li.restDayHours),
        restDayPay: round2(Number(li.restDayPay) * ratio),
      };

      const period = li.payrollReport.period;
      const taxYearStart = new Date(Date.UTC(period.startDate.getUTCFullYear(), 0, 1));
      const prior = await this.prisma.payrollLineItem.groupBy({
        by: ['userId'],
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId,
          payrollReport: {
            period: {
              deletedAt: null,
              startDate: { gte: taxYearStart, lt: period.startDate },
            },
          },
        },
        _sum: {
          grossTotal: true,
          sssContribution: true,
          philhealthContribution: true,
          pagibigContribution: true,
          incomeTaxWithheld: true,
        },
      });

      const statutory = this.computeStatutoryFigures({
        basePay: estimatedPay,
        premiums,
        prior: prior[0]?._sum,
        periodsInMonth: periodsPerMonth(period.type),
        settings,
        brackets,
        thirteenthMonth: li.isThirteenthMonth,
      });

      await this.prisma.payrollLineItem.update({
        where: { id: li.id },
        data: {
          compensationType: compInfo.compensationType,
          hourlyRate: compInfo.hourlyRate,
          dailyRate: compInfo.dailyRate,
          daysPerWeek: compInfo.daysPerWeek,
          daysWorked,
          estimatedPay,
          regularPay,
          overtimePay,
          ...statutory,
          // BUG-BC: a rate change does not change a de minimis allowance, so the
          // snapshotted amount is carried forward and re-added on top of the
          // freshly computed net. Without this, repricing would silently strip
          // the allowance out of an open period's net pay.
          netPay: round2(statutory.netPay + Number(li.deMinimisTotal)),
          updatedBy: actorId,
        },
      });
    }
  }

  // -- Payroll Periods --

  async findAllPeriods(p: AuthPrincipal, query: PayrollPeriodQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.PayrollPeriodWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status as PayrollPeriodStatus } : {}),
      // BUG-AX: lets the period dropdown show only standardized, system-generated
      // periods. Omitted = every period (auto + off-cycle custom), the prior behaviour.
      ...(query.isAutoGenerated !== undefined
        ? { isAutoGenerated: query.isAutoGenerated === 'true' }
        : {}),
    };
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.payrollPeriod.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

    // BUG-AX: the standardized semi-monthly periods (1st–15th, 16th–EOM) are owned
    // by PayrollPeriodScheduler. Manual creation is for off-cycle payroll only, so
    // it may not mint a competing FIRST_HALF/SECOND_HALF period by hand.
    if (dto.type !== 'CUSTOM') {
      throw new UnprocessableEntityException(
        'Semi-monthly periods are generated automatically. Manual creation is limited to CUSTOM off-cycle periods.',
      );
    }

    // BUG-AX: reject any overlap, not just an exact date match. Overlapping ranges
    // are what produced the reported "Jul 1–Jul 31" / "Jul 14–Jul 31" / "Jul 15–Jul 17"
    // mess and make timesheet→period routing ambiguous.
    const conflict = await this.prisma.payrollPeriod.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, startDate: true, endDate: true },
    });
    if (conflict) {
      throw new ConflictException(
        `This range overlaps an existing payroll period (${conflict.startDate.toISOString().slice(0, 10)} – ${conflict.endDate.toISOString().slice(0, 10)}). Payroll periods may not overlap.`,
      );
    }

    // BUG-BM: an explicit cutoff wins; otherwise every period still gets one, so
    // a submission against it can always be classified on-time or late.
    let cutoffDate = defaultPeriodCutoff(endDate);
    if (dto.cutoffDate) {
      const parsed = new Date(dto.cutoffDate);
      if (isNaN(parsed.getTime())) {
        throw new UnprocessableEntityException('cutoffDate must be a valid date');
      }
      if (parsed < startDate) {
        throw new UnprocessableEntityException('cutoffDate must not precede startDate');
      }
      cutoffDate = parsed;
    }

    const period = await this.prisma.payrollPeriod.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        type: dto.type,
        status: 'OPEN',
        startDate,
        endDate,
        cutoffDate,
        name: dto.name?.trim() || undefined,
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
  async generateReport(
    p: AuthPrincipal,
    periodId: string,
    idempotencyKey: string,
    thirteenthMonth = false,
    employeeIds?: string[],
    timesheetIds?: string[],
  ) {
    const period = await this.findOnePeriod(p, periodId);
    if (period.status === 'EXPORTED') {
      throw new ConflictException('Payroll period is already exported and locked (BR-PAY-04)');
    }
    const isFinanceRole = p.roles.some((r) => r === 'FINANCE') && !p.roles.some((r) => r === 'ADMIN' || r === 'HR');
    if (isFinanceRole && (period.processingStatus === 'DRAFT' || period.status === 'OPEN')) {
      throw new ForbiddenException('Cannot recalculate: Payroll period is pending HR submission');
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

    // Gather Supervisor-approved timesheets within the period date range, filtered
    // by employeeIds or timesheetIds if specified for selective processing (BUG-BK).
    const tsWhere: any = this.payableTimesheetsWhere(p, period);
    if (employeeIds && employeeIds.length > 0) {
      tsWhere.userId = { in: employeeIds };
    }
    if (timesheetIds && timesheetIds.length > 0) {
      tsWhere.id = { in: timesheetIds };
    }

    const timesheets = await this.prisma.timesheet.findMany({
      where: tsWhere,
      select: { id: true, userId: true, totalMinutes: true, overtimeMinutesOverride: true },
    });

    // Aggregate approved minutes per user
    const userMinutes = new Map<string, number>();
    for (const ts of timesheets) {
      userMinutes.set(ts.userId, (userMinutes.get(ts.userId) ?? 0) + ts.totalMinutes);
    }

    // Timesheets a supervisor adjusted during review carry an explicit overtime
    // figure (BUG-Q). Their regular/overtime split is taken from that figure and
    // their entries are held out of the daily >8h rollup below, so the two can
    // never double-count. Timesheets without an override — every timesheet until
    // a supervisor sets one — are unaffected.
    const adjustedTimesheetIds = new Set<string>();
    const adjustedSplitByUser = new Map<string, { overtimeMins: number; regularMins: number }>();
    for (const ts of timesheets) {
      if (ts.overtimeMinutesOverride === null) continue;
      adjustedTimesheetIds.add(ts.id);
      const split = adjustedSplitByUser.get(ts.userId) ?? { overtimeMins: 0, regularMins: 0 };
      split.overtimeMins += ts.overtimeMinutesOverride;
      split.regularMins += Math.max(0, ts.totalMinutes - ts.overtimeMinutesOverride);
      adjustedSplitByUser.set(ts.userId, split);
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
      select: {
        id: true,
        hourlyRate: true,
        compensationType: true,
        dailyRate: true,
        daysPerWeek: true,
      },
    });

    // Fetch all approved time entries to compute daily overtime (>8h/day)
    const targetTimesheetIds = timesheets.map((t) => t.id);
    const approvedEntries = targetTimesheetIds.length > 0
      ? await this.prisma.timeEntry.findMany({
          where: {
            tenantId: p.tenantId,
            timesheetId: { in: targetTimesheetIds },
            deletedAt: null,
          },
          select: {
            userId: true,
            timesheetId: true,
            startTime: true,
            durationMinutes: true,
          },
        })
      : [];

    // Group approved entries by userId and *local* calendar day. Bucketing by
    // UTC split a normal Manila shift (which starts before 08:00 local, i.e.
    // before UTC midnight) across two days, understating each and hiding the
    // daily overtime threshold below.
    const timeZone = await this.timeZones.forPrincipal(p);
    // Read once per run so every line item in a report is priced identically,
    // even if an admin edits the rate mid-generation (BUG-AQ).
    const overtimeMultiplier = await this.overtimeRates.forPrincipal(p);
    const userDailyMinutes = new Map<string, Map<string, number>>();
    for (const entry of approvedEntries) {
      if (!entry.durationMinutes) continue;
      if (entry.timesheetId && adjustedTimesheetIds.has(entry.timesheetId)) continue;
      const dateStr = orgDayKey(entry.startTime, timeZone);
      let userDays = userDailyMinutes.get(entry.userId);
      if (!userDays) {
        userDays = new Map<string, number>();
        userDailyMinutes.set(entry.userId, userDays);
      }
      userDays.set(dateStr, (userDays.get(dateStr) ?? 0) + entry.durationMinutes);
    }

    // ── FEAT-3: Philippine statutory premiums, contributions and withholding ──

    const settings = await this.payrollSettings.forPrincipal(p);
    const brackets = await this.birTax.getBrackets(settings.birTaxTableYear);
    const periodsInMonth = periodsPerMonth(period.type);

    // Holidays falling inside the period, keyed by calendar day. `date` is a
    // date-only column so it is compared as a plain key, not an instant.
    const holidays = await this.prisma.holiday.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        date: { gte: period.startDate, lte: period.endDate },
      },
      select: { date: true, type: true, name: true },
    });
    const holidayByKey = new Map(holidays.map((h) => [dateOnlyKey(h.date), h]));

    // BUG-BB: an exiting employee's final pay is held until every department has
    // signed off their clearance. The hold is *per employee* — an earlier version
    // aborted the whole run on the first incomplete checklist, which meant one
    // person mid-offboarding stopped the entire organisation from being paid.
    const unclearedChecklists = await this.prisma.clearanceChecklist.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: { in: eligibleUsers.map((u) => u.id) },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deletedAt: null,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const blockedUserIds = new Set(unclearedChecklists.map((c) => c.employeeId));
    const blockedByClearance = unclearedChecklists.map((c) => ({
      userId: c.employeeId,
      name: `${c.employee.firstName} ${c.employee.lastName}`,
      clearanceStatus: c.status,
    }));

    // Everyone the run actually pays. Held employees get no line item, and — see
    // the timesheet transition below — their timesheets are also left UNPAID, so
    // a later run picks them up once clearance completes. Excluding them from the
    // line items *without* excluding their timesheets would strand those sheets in
    // PROCESSING with nothing to pay them out.
    const payableUsers = eligibleUsers.filter((u) => !blockedUserIds.has(u.id));
    const payableTimesheetIds = timesheets
      .filter((ts) => !blockedUserIds.has(ts.userId))
      .map((ts) => ts.id);

    // BUG-BC: non-taxable de minimis allowances payable this period, prorated
    // from the stored monthly amounts. Read before the transaction so it never
    // extends the write window, and applied *after* tax so no contribution or
    // withholding base changes.
    const deMinimisByUser = await this.compensationBenefits.deMinimisTotalsForPeriod(
      p.tenantId,
      p.organizationId,
      payableUsers.map((u) => u.id),
      periodsInMonth,
    );

    // Fetch all published shifts for the period to determine employee rest days
    const publishedShifts = await this.prisma.shift.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'PUBLISHED',
        deletedAt: null,
        shiftDate: { gte: period.startDate, lte: period.endDate },
      },
      select: { userId: true, shiftDate: true },
    });
    const userScheduledDates = new Map<string, Set<string>>();
    for (const s of publishedShifts) {
      let dates = userScheduledDates.get(s.userId);
      if (!dates) {
        dates = new Set<string>();
        userScheduledDates.set(s.userId, dates);
      }
      dates.add(dateOnlyKey(s.shiftDate));
    }

    // Night-differential, holiday, and rest day minutes are attributed from *all* approved
    // entries — including those on supervisor-adjusted timesheets, which are
    // held out of the daily-overtime rollup above. The premiums are independent
    // of the regular/overtime split, so excluding them there does not exclude
    // them here.
    const userNightMinutes = new Map<string, number>();
    const userHolidayMinutes = new Map<string, Map<string, number>>();
    const userRestDayMinutes = new Map<string, number>();
    for (const entry of approvedEntries) {
      if (!entry.durationMinutes) continue;

      const nightMins = nightShiftMinutes(
        entry.startTime,
        entry.durationMinutes,
        timeZone,
        settings.nightShiftStartHour,
        settings.nightShiftEndHour,
      );
      if (nightMins > 0) {
        userNightMinutes.set(entry.userId, (userNightMinutes.get(entry.userId) ?? 0) + nightMins);
      }

      const dayKey = orgDayKey(entry.startTime, timeZone);
      if (holidayByKey.has(dayKey)) {
        let days = userHolidayMinutes.get(entry.userId);
        if (!days) {
          days = new Map<string, number>();
          userHolidayMinutes.set(entry.userId, days);
        }
        days.set(dayKey, (days.get(dayKey) ?? 0) + entry.durationMinutes);
      }

      const scheduled = userScheduledDates.get(entry.userId);
      const entryDate = new Date(entry.startTime);
      const isRestDay = scheduled
        ? !scheduled.has(dayKey)
        : (entryDate.getUTCDay() === 0 || entryDate.getUTCDay() === 6);
      if (isRestDay) {
        userRestDayMinutes.set(entry.userId, (userRestDayMinutes.get(entry.userId) ?? 0) + entry.durationMinutes);
      }
    }

    // Year-to-date figures from every earlier period in the same tax year. The
    // cumulative withholding method needs these, and reading them as a sum of
    // already-issued line items means a regeneration of *this* period cannot
    // move an employee's YTD backward.
    const taxYearStart = new Date(Date.UTC(period.startDate.getUTCFullYear(), 0, 1));
    const priorTotals = await this.prisma.payrollLineItem.groupBy({
      by: ['userId'],
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        payrollReport: {
          period: {
            deletedAt: null,
            startDate: { gte: taxYearStart },
            endDate: { lt: period.startDate },
          },
        },
      },
      _sum: {
        grossTotal: true,
        sssContribution: true,
        philhealthContribution: true,
        pagibigContribution: true,
        incomeTaxWithheld: true,
      },
    });
    const priorByUser = new Map(priorTotals.map((row) => [row.userId, row._sum]));

    // Create the payroll report + line items in a transaction
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
      let totalGross = new Decimal(0);
      let totalNet = new Decimal(0);
      let totalWithheld = new Decimal(0);
      let totalEmployerCost = new Decimal(0);
      let totalDeMinimis = new Decimal(0);

      for (const user of payableUsers) {
        const compType = user.compensationType ?? 'HOURLY';
        const hRate = user.hourlyRate ? Number(user.hourlyRate) : 0;
        const dRate = user.dailyRate ? Number(user.dailyRate) : hRate * 8;
        const dpw = user.daysPerWeek ? Number(user.daysPerWeek) : 5;
        const effectiveHourlyRate = compType === 'DAILY' ? dRate / 8 : hRate;

        // Timesheet.totalMinutes, summed across this user's sheets. NOT used to
        // pay — time entries are the ledger and this column is a cache of them
        // (see the reconciliation check after the split below). Kept only to
        // detect the two disagreeing.
        const headerMins = userMinutes.get(user.id) ?? 0;
        const pendingMins = pendingMinutes.get(user.id) ?? 0;
        const rejectedMins = rejectedMinutes.get(user.id) ?? 0;

        const userDays = userDailyMinutes.get(user.id);
        const adjustedSplit = adjustedSplitByUser.get(user.id);
        let overtimeMins = adjustedSplit?.overtimeMins ?? 0;
        let regularMins = adjustedSplit?.regularMins ?? 0;
        if (userDays) {
          const REGULAR_DAY_MINUTES = 8 * 60;
          for (const [_, dayMinutes] of userDays) {
            if (dayMinutes > REGULAR_DAY_MINUTES) {
              overtimeMins += dayMinutes - REGULAR_DAY_MINUTES;
              regularMins += REGULAR_DAY_MINUTES;
            } else {
              regularMins += dayMinutes;
            }
          }
        }

        // Reconciliation. Time entries are authoritative: attachEntries refuses
        // an entry already owned by another sheet, so each entry belongs to
        // exactly one timesheet and cannot be paid twice. Timesheet.totalMinutes
        // is a cache recomputed from those entries, so a mismatch means the
        // cache is stale — never a reason to pay minutes with no entry behind
        // them. Paying the header instead would let a stale cache bill for
        // minutes whose entries now sit on a different, separately payable
        // sheet. Surfaced rather than swallowed: this used to be computed and
        // silently discarded, so a header claiming time that no entry supported
        // showed as hours in Timesheets and zero in Payroll with nothing said.
        if (headerMins !== regularMins + overtimeMins) {
          this.logger.warn(
            `Timesheet total (${headerMins}m) disagrees with its time entries ` +
              `(${regularMins + overtimeMins}m) for user ${user.id} in period ${periodId}. ` +
              'Paying the entries.',
          );
        }

        const overtimeHours = new Decimal(overtimeMins).div(60);
        const regularHours = new Decimal(regularMins).div(60);
        const approvedHours = regularHours.add(overtimeHours);
        const pendingHours = new Decimal(pendingMins).div(60);
        const rejectedHours = new Decimal(rejectedMins).div(60);

        const daysWorked = approvedHours.div(8);
        const regularDays = regularHours.div(8);

        let regularPay: Decimal;
        if (compType === 'DAILY') {
          regularPay = regularDays.mul(dRate);
        } else {
          regularPay = regularHours.mul(hRate);
        }

        const overtimePay = overtimeHours.mul(effectiveHourlyRate).mul(overtimeMultiplier);
        const estimatedPay = regularPay.add(overtimePay);

        totalEstimatedPay = totalEstimatedPay.add(estimatedPay);

        const premiums = this.computePremiums({
          rate: effectiveHourlyRate,
          nightMinutes: userNightMinutes.get(user.id) ?? 0,
          holidayMinutesByDay: userHolidayMinutes.get(user.id),
          holidayByKey,
          restDayMinutes: userRestDayMinutes.get(user.id) ?? 0,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          hasWorkedHours: approvedHours.greaterThan(0),
          settings,
        });

        const statutory = this.computeStatutoryFigures({
          basePay: Number(estimatedPay),
          premiums,
          prior: priorByUser.get(user.id),
          periodsInMonth,
          settings,
          brackets,
          thirteenthMonth,
        });

        // BUG-BC: de minimis is paid on top of net pay. It is spread *after*
        // `statutory` so gross, taxable income and every contribution base
        // stay exactly as computeStatutoryFigures left them — only net moves.
        const deMinimisTotal = deMinimisByUser.get(user.id) ?? 0;
        const netPayWithDeMinimis = round2(statutory.netPay + deMinimisTotal);

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
            compensationType: compType,
            hourlyRate: effectiveHourlyRate,
            dailyRate: dRate,
            daysPerWeek: dpw,
            daysWorked,
            estimatedPay,
            regularPay,
            overtimePay,
            ...statutory,
            deMinimisTotal,
            netPay: netPayWithDeMinimis,
            createdBy: p.userId,
            updatedBy: p.userId,
          },
        });

        totalGross = totalGross.add(statutory.grossTotal);
        totalNet = totalNet.add(netPayWithDeMinimis);
        totalDeMinimis = totalDeMinimis.add(deMinimisTotal);
        totalWithheld = totalWithheld.add(statutory.incomeTaxWithheld);
        totalEmployerCost = totalEmployerCost
          .add(statutory.sssEmployerShare)
          .add(statutory.philhealthEmployerShare)
          .add(statutory.pagibigEmployerShare);
      }

      // BUG-AY: the timesheets folded into this run enter the financial pipeline —
      // UNPAID → PROCESSING. Already-PAID sheets were filtered out of `timesheets`
      // above, so they can never be walked backwards to PROCESSING here.
      // BUG-BB: only the timesheets this run actually paid advance. A clearance-held
      // employee's sheets stay UNPAID so the next run — once clearance completes —
      // still picks them up, rather than leaving them in PROCESSING against a
      // report that has no line item for them.
      if (payableTimesheetIds.length > 0) {
        await tx.timesheet.updateMany({
          where: {
            id: { in: payableTimesheetIds },
            paymentStatus: 'UNPAID',
          },
          data: { paymentStatus: 'PROCESSING', updatedBy: p.userId },
        });
      }

      // BUG-AY (verify step e): payment-status breakdown for this period, read back
      // after the transition above so the report reflects post-update state.
      const paymentGroups = await tx.timesheet.groupBy({
        by: ['paymentStatus'],
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          deletedAt: null,
          periodStart: { gte: period.startDate },
          periodEnd: { lte: period.endDate },
        },
        _count: { _all: true },
      });
      const paymentStatusBreakdown = {
        UNPAID: 0,
        PROCESSING: 0,
        PAID: 0,
        ...Object.fromEntries(paymentGroups.map((g) => [g.paymentStatus, g._count._all])),
      };

      // Update report totals and period status
      await tx.payrollReport.update({
        where: { id: newReport.id },
        data: {
          totals: {
            headcount: payableUsers.length,
            // BUG-BB: who this run deliberately did not pay, and why. Surfaced on
            // the report so Finance sees the hold instead of silently short-paying
            // the period and having to reconcile a missing person later.
            blockedByClearance,
            paymentStatusBreakdown,
            totalEstimatedPay: totalEstimatedPay.toFixed(2),
            // FEAT-3 additions. `totalEstimatedPay` is left untouched above
            // because the finance dashboards already read that key.
            totalGrossPay: totalGross.toFixed(2),
            totalNetPay: totalNet.toFixed(2),
            totalTaxWithheld: totalWithheld.toFixed(2),
            totalEmployerContributions: totalEmployerCost.toFixed(2),
            // BUG-BC: reported separately from gross precisely because it is
            // non-taxable — it is in totalNetPay but in no tax base.
            totalDeMinimis: totalDeMinimis.toFixed(2),
            isThirteenthMonth: thirteenthMonth,
            birTaxTableYear: settings.birTaxTableYear,
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
    await this.invalidateFinanceCache(p.organizationId);

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

    await this.invalidateFinanceCache(p.organizationId);
    return updated;
  }

  async unlockPeriod(p: AuthPrincipal, periodId: string) {
    const period = await this.findOnePeriod(p, periodId);
    if (period.status !== 'LOCKED' && period.status !== 'GENERATED') {
      throw new ConflictException(
        `Cannot unlock a payroll period with status ${period.status}. Only LOCKED or GENERATED periods can be unlocked.`,
      );
    }
    const updated = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'OPEN',
        lockedAt: null,
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
        metadata: { action: 'unlockPeriod' },
      },
    }).catch(() => {});

    await this.invalidateFinanceCache(p.organizationId);
    return updated;
  }

  /**
   * Reset period data: deletes generated report line items, resets the period status to 'OPEN',
   * and reverts any timesheets in this date range from APPROVED/PAYROLL_READY/SUBMITTED back to DRAFT
   * so testing can be re-done completely.
   */
  async resetPeriodData(p: AuthPrincipal, periodId: string) {
    const period = await this.findOnePeriod(p, periodId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete generated reports and line items
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

      // 2. Revert timesheets spanning this period to DRAFT
      await tx.timesheet.updateMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          periodStart: { gte: period.startDate },
          periodEnd: { lte: period.endDate },
        },
        data: {
          status: 'DRAFT',
          submittedAt: null,
          decidedAt: null,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      // 3. Reset period status to OPEN
      const updatedPeriod = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'OPEN',
          lockedAt: null,
          exportedAt: null,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      return updatedPeriod;
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

    await this.invalidateFinanceCache(p.organizationId);
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
  /**
   * The timesheets a generation run for `period` would pay.
   *
   * Extracted (BUG-BR) so the staleness check asks exactly the question
   * Recalculate answers — a second copy of this predicate would drift from the
   * run it claims to describe, and a banner that lies about pending work is
   * worse than no banner.
   *
   * BUG-BL: honour the explicit period link the employee chose at submission
   * (and that BUG-BM keeps pinned), falling back to the work-date range only for
   * sheets not linked to any period. Same predicate as the send-to-bank step, so
   * a sheet routed here is paid here — a late submission against a historical
   * period is picked up by that period's run, not a neighbour's.
   */
  private payableTimesheetsWhere(
    p: AuthPrincipal,
    period: { id: string; startDate: Date; endDate: Date },
  ): Prisma.TimesheetWhereInput {
    return {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      status: { in: ['APPROVED', 'PAYROLL_READY'] },
      paymentStatus: { not: 'PAID' },
      deletedAt: null,
      OR: [
        { payrollPeriodId: period.id },
        {
          payrollPeriodId: null,
          periodStart: { gte: period.startDate },
          periodEnd: { lte: period.endDate },
        },
      ],
    };
  }

  /**
   * BUG-BR: is this period's report older than the approvals feeding it?
   *
   * Approving a timesheet does not recalculate payroll, and nothing said so —
   * which is how a period showed "0 hours" for someone whose sheet was approved
   * four hours after the report was generated. This answers the question the
   * screen needs to ask, so an operator can see the gap instead of having to
   * remember to click Recalculate.
   *
   * Deliberately a read: auto-generating on approval would rewrite a report — it
   * deletes and recreates every line item — on a schedule nobody chose, and the
   * decision to redo payroll belongs to Finance, not to whoever approves a
   * timesheet.
   */
  async periodStaleness(p: AuthPrincipal, periodId: string) {
    const period = await this.findOnePeriod(p, periodId); // 404s if not in this org

    const report = await this.prisma.payrollReport.findFirst({
      where: {
        payrollPeriodId: periodId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
      },
      select: { createdAt: true },
    });

    const payable = await this.prisma.timesheet.findMany({
      where: this.payableTimesheetsWhere(p, period),
      select: { decidedAt: true, updatedAt: true },
    });

    // decidedAt is when the supervisor approved it; fall back to updatedAt for
    // rows that predate the column being populated.
    const approvalTimes = payable
      .map((t) => t.decidedAt ?? t.updatedAt)
      .filter((d): d is Date => Boolean(d));
    const latestApprovalAt =
      approvalTimes.length > 0
        ? new Date(Math.max(...approvalTimes.map((d) => d.getTime())))
        : null;

    const lastRecalculatedAt = report?.createdAt ?? null;
    const isStale =
      payable.length > 0 &&
      (lastRecalculatedAt === null ||
        (latestApprovalAt !== null && latestApprovalAt > lastRecalculatedAt));

    return {
      lastRecalculatedAt,
      latestApprovalAt,
      /** Approved, unpaid timesheets this period's next run would pay. */
      payableTimesheetCount: payable.length,
      isStale,
    };
  }

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

  async exportPayslipPdf(p: AuthPrincipal, id: string): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const item = await this.prisma.payrollLineItem.findFirst({
      where: { id, tenantId: p.tenantId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, jobTitle: true, hourlyRate: true, dailyRate: true, compensationType: true, department: { select: { name: true } } } },
        payrollReport: {
          include: {
            period: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Payslip not found');
    
    const isAllowedRole = p.roles.some((r) => r === 'FINANCE' || r === 'ADMIN' || r === 'HR');
    if (item.userId !== p.userId && !isAllowedRole) {
      throw new ForbiddenException('Not permitted to view this payslip');
    }

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    registerPdfFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    doc.fontSize(20).font(PDF_FONT_BOLD).text('TimeForge Payslip', { align: 'center' });
    doc.moveDown(1.5);

    const startY = doc.y;
    doc.fontSize(10).font(PDF_FONT_BOLD).text('EMPLOYEE DETAILS:', 40, startY);
    doc.font(PDF_FONT)
      .text(`Name: ${item.user.firstName} ${item.user.lastName}`)
      .text(`Job Title: ${item.user.jobTitle ?? 'Employee'}`)
      .text(`Department: ${item.user.department?.name ?? 'No Department'}`)
      .text(`Email: ${item.user.email}`);

    const rightX = 300;
    doc.font(PDF_FONT_BOLD).text('PAYSLIP DETAILS:', rightX, startY);
    doc.font(PDF_FONT)
      .text(`Pay Period: ${item.payrollReport.period.startDate.toISOString().slice(0, 10)} to ${item.payrollReport.period.endDate.toISOString().slice(0, 10)}`, rightX)
      .text(`Status: ${item.payrollReport.period.status}`, rightX)
      .text(`Issued On: ${item.createdAt.toISOString().slice(0, 10)}`, rightX);

    doc.moveDown(2);
    
    const currentY = doc.y;
    doc.moveTo(40, currentY).lineTo(doc.page.width - 40, currentY).stroke();
    doc.moveDown(1);

    doc.fontSize(12).font(PDF_FONT_BOLD).text('Earnings Breakdown');
    doc.moveDown(0.5);

    const cols = ['Description', 'Hours / Rate', 'Amount'];
    const colW = [250, 150, 120];
    let x = 40;
    doc.fontSize(10).font(PDF_FONT_BOLD);
    const earningsHeaderY = doc.y;
    cols.forEach((c, i) => {
      doc.text(c, x, earningsHeaderY, { width: colW[i], lineBreak: false });
      x += colW[i];
    });
    doc.y = earningsHeaderY;
    doc.moveDown(1);
    doc.font(PDF_FONT);

    const tableLineY = doc.y;
    doc.moveTo(40, tableLineY).lineTo(doc.page.width - 40, tableLineY).stroke();
    doc.moveDown(0.4);

    const overtimeMultiplier = await this.overtimeRates.forPrincipal(p);
    const { compType, rate, dailyRate, regularDays, regular, overtime, regPay, otPay, gross } = this.resolvePayslipEarnings(
      item,
      item.user.hourlyRate,
      overtimeMultiplier,
      item.user.dailyRate,
      item.user.compensationType,
    );

    const drawTableRow = (desc: string, rateVal: string, amount: string) => {
      const rowY = doc.y;
      doc.text(desc, 40, rowY, { width: colW[0] });
      doc.text(rateVal, 40 + colW[0], rowY, { width: colW[1] });
      doc.text(amount, 40 + colW[0] + colW[1], rowY, { width: colW[2] });
      doc.moveDown(0.5);
    };

    if (compType === 'DAILY') {
      drawTableRow('Regular Work (Daily)', `${regularDays.toFixed(2)} days @ ₱${dailyRate.toFixed(2)}/day`, `₱${regPay.toFixed(2)}`);
    } else {
      drawTableRow('Regular Hours', `${regular.toFixed(2)} hrs @ ₱${rate.toFixed(2)}/hr`, `₱${regPay.toFixed(2)}`);
    }
    drawTableRow('Overtime Hours', `${overtime.toFixed(2)} hrs @ ₱${(rate * overtimeMultiplier).toFixed(2)}/hr`, `₱${otPay.toFixed(2)}`);

    // FEAT-3: premiums and statutory deductions. Figures are read from the
    // snapshot on the line item, not recomputed, so a settings change after the
    // period was generated can never alter an already-issued payslip.
    const holidayPay = Number(item.holidayPay);
    const nightDifferential = Number(item.nightDifferential);
    if (holidayPay !== 0) {
      drawTableRow('Holiday Pay', `${Number(item.holidayHours).toFixed(2)} hrs (premium)`, `₱${holidayPay.toFixed(2)}`);
    }
    if (nightDifferential !== 0) {
      drawTableRow('Night Differential', `${Number(item.nightDiffHours).toFixed(2)} hrs (premium)`, `₱${nightDifferential.toFixed(2)}`);
    }
    if (item.isThirteenthMonth) {
      drawTableRow('13th Month Pay', 'Statutory benefit', `₱${Number(item.grossTotal).toFixed(2)}`);
    }
    // BUG-BC: shown as its own line, below the earnings that make up gross and
    // deliberately outside the Gross Earnings subtotal — a de minimis benefit
    // within its BIR ceiling is not part of taxable compensation.
    const deMinimisTotal = Number(item.deMinimisTotal);

    // Pre-FEAT-3 line items carry gross_total backfilled from estimated_pay; the
    // derived gross stays the fallback for anything that predates even that.
    const storedGross = Number(item.grossTotal);
    const grossEarnings = storedGross > 0 ? storedGross : gross + holidayPay + nightDifferential;

    doc.moveDown(0.5);
    const totalLineY = doc.y;
    doc.moveTo(40, totalLineY).lineTo(doc.page.width - 40, totalLineY).stroke();
    doc.moveDown(0.5);

    doc.fontSize(11).font(PDF_FONT_BOLD);
    const grossY = doc.y;
    doc.text('Gross Earnings', 40, grossY, { width: colW[0] });
    doc.text(`₱${grossEarnings.toFixed(2)}`, 40 + colW[0] + colW[1], grossY, { width: colW[2] });

    doc.moveDown(1.5);
    doc.fontSize(12).font(PDF_FONT_BOLD).text('Deductions', 40);
    doc.moveDown(0.5);
    doc.fontSize(10).font(PDF_FONT);

    const deductionLineY = doc.y;
    doc.moveTo(40, deductionLineY).lineTo(doc.page.width - 40, deductionLineY).stroke();
    doc.moveDown(0.4);

    const sss = Number(item.sssContribution);
    const philhealth = Number(item.philhealthContribution);
    const pagibig = Number(item.pagibigContribution);
    const tax = Number(item.incomeTaxWithheld);
    const totalDeductions = Number(item.totalDeductions);

    drawTableRow('SSS Contribution', 'Employee share', `₱${sss.toFixed(2)}`);
    drawTableRow('PhilHealth Contribution', 'Employee share', `₱${philhealth.toFixed(2)}`);
    drawTableRow('Pag-IBIG Contribution', 'Employee share', `₱${pagibig.toFixed(2)}`);
    drawTableRow('Withholding Tax', 'BIR', `₱${tax.toFixed(2)}`);

    doc.moveDown(0.5);
    const dedTotalY = doc.y;
    doc.moveTo(40, dedTotalY).lineTo(doc.page.width - 40, dedTotalY).stroke();
    doc.moveDown(0.5);

    doc.fontSize(11).font(PDF_FONT_BOLD);
    const totalDedY = doc.y;
    doc.text('Total Deductions', 40, totalDedY, { width: colW[0] });
    doc.text(`₱${totalDeductions.toFixed(2)}`, 40 + colW[0] + colW[1], totalDedY, { width: colW[2] });

    if (deMinimisTotal !== 0) {
      doc.moveDown(1.5);
      doc.fontSize(12).font(PDF_FONT_BOLD).text('Non-Taxable Benefits (De Minimis)', 40);
      doc.moveDown(0.5);
      doc.fontSize(10).font(PDF_FONT);
      const dmLineY = doc.y;
      doc.moveTo(40, dmLineY).lineTo(doc.page.width - 40, dmLineY).stroke();
      doc.moveDown(0.4);
      drawTableRow('De Minimis Benefits', 'Within BIR ceiling — non-taxable', `₱${deMinimisTotal.toFixed(2)}`);
      doc.fontSize(11).font(PDF_FONT_BOLD);
    }

    doc.moveDown(1);
    const netY = doc.y;
    doc.fontSize(13).font(PDF_FONT_BOLD);
    doc.text('NET PAY', 40, netY, { width: colW[0] });
    doc.text(`₱${Number(item.netPay).toFixed(2)}`, 40 + colW[0] + colW[1], netY, { width: colW[2] });

    doc.moveDown(1.5);
    doc.fontSize(9).font(PDF_FONT_BOLD).text('Year to Date', 40);
    doc.font(PDF_FONT)
      .text(`Taxable Income: ₱${Number(item.ytdTaxableIncome).toFixed(2)}`, 40)
      .text(`Tax Withheld: ₱${Number(item.ytdTaxWithheld).toFixed(2)}`, 40);

    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica-Oblique').text('This is a system-generated payslip from TimeForge. No signature is required.', { align: 'center' });

    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'payslip_export',
        entityId: id,
        metadata: { format: 'PDF', employeeId: item.userId },
      },
    }).catch(() => {});

    const filename = `payslip-${item.user.lastName}-${item.payrollReport.period.startDate.toISOString().slice(0, 10)}.pdf`;
    return { buffer, contentType: 'application/pdf', filename };
  }

  /**
   * Employee self-endpoint: returns their own payroll status (including base rate and estimated pay).
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
        holidayHours: true,
        nightDiffHours: true,
        restDayHours: true,
        regularPay: true,
        overtimePay: true,
        nightDifferential: true,
        holidayPay: true,
        restDayPay: true,
        grossTotal: true,
        totalDeductions: true,
        netPay: true,
        // BUG-BC: surfaced as its own field so the payslip screen can render it
        // as a separate non-taxable line rather than folding it into gross.
        deMinimisTotal: true,
        hourlyRate: true,
        estimatedPay: true,
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
    return lineItems;
  }

  // -- Hourly Rate Management --

  async getRate(p: AuthPrincipal, userId: string) {
    const isAllowedRole = p.roles.some((r) => r === 'FINANCE' || r === 'ADMIN' || r === 'HR' || r === 'SUPERVISOR');
    if (userId !== p.userId && !isAllowedRole && !this.can(p, PERMISSIONS.PAYROLL_RATE_READ)) {
      throw new ForbiddenException('Hourly rate is Finance/Admin only (BR-PAY-06)');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, compensationType: true, hourlyRate: true, dailyRate: true, daysPerWeek: true, version: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateRate(
    p: AuthPrincipal,
    userId: string,
    rateOrOpts: number | {
      compensationType?: CompensationType;
      rate?: number;
      hourlyRate?: number;
      dailyRate?: number;
      daysPerWeek?: number;
      version?: number;
    },
    versionParam?: number,
  ) {
    if (!this.can(p, PERMISSIONS.PAYROLL_RATE_UPDATE)) {
      throw new ForbiddenException('Only Finance/Admin can update rates (BR-PAY-06)');
    }
    const opts = typeof rateOrOpts === 'number'
      ? { rate: rateOrOpts, version: versionParam }
      : rateOrOpts;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const expectedVersion = opts.version ?? versionParam;
    if (expectedVersion !== undefined && expectedVersion !== null && user.version !== expectedVersion) {
      throw new ConflictException('Version mismatch');
    }

    const compensationType = opts.compensationType ?? user.compensationType ?? 'HOURLY';
    const daysPerWeek = opts.daysPerWeek ?? (user.daysPerWeek ? Number(user.daysPerWeek) : 5);

    let hourlyRate = user.hourlyRate ? Number(user.hourlyRate) : 0;
    let dailyRate = user.dailyRate ? Number(user.dailyRate) : 0;

    if (compensationType === 'DAILY') {
      if (opts.dailyRate !== undefined && opts.dailyRate !== null) {
        dailyRate = opts.dailyRate;
      } else if (opts.rate !== undefined && opts.rate !== null) {
        dailyRate = opts.rate;
      }
      if (dailyRate < 0) throw new UnprocessableEntityException('Daily rate must be >= 0');
      hourlyRate = dailyRate / 8;
    } else {
      if (opts.hourlyRate !== undefined && opts.hourlyRate !== null) {
        hourlyRate = opts.hourlyRate;
      } else if (opts.rate !== undefined && opts.rate !== null) {
        hourlyRate = opts.rate;
      }
      if (hourlyRate < 0) throw new UnprocessableEntityException('Hourly rate must be >= 0');
      dailyRate = hourlyRate * 8;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        compensationType,
        hourlyRate,
        dailyRate,
        daysPerWeek,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        compensationType: true,
        hourlyRate: true,
        dailyRate: true,
        daysPerWeek: true,
        version: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'user',
        entityId: userId,
        metadata: {
          action: 'updateRate',
          compensationType,
          previousHourlyRate: user.hourlyRate,
          newHourlyRate: hourlyRate,
          previousDailyRate: user.dailyRate,
          newDailyRate: dailyRate,
        },
      },
    }).catch(() => {});

    const overtimeMultiplier = await this.overtimeRates.forPrincipal(p);
    await this.recalculateOpenLineItemsForUser(
      p,
      userId,
      { compensationType, hourlyRate, dailyRate, daysPerWeek },
      p.userId,
      overtimeMultiplier,
    ).catch((err: Error) =>
      this.logger.warn(`Failed to backfill payroll line items after rate update: ${err.message}`),
    );

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

      const deptSplits = new Map<string, { grossTotal: number; userIds: Set<string> }>();
      
      if (per.reports.length > 0 && per.reports[0].lineItems.length > 0) {
        for (const item of per.reports[0].lineItems) {
          const deptName = item.user.department?.name ?? 'Operations';
          const current = deptSplits.get(deptName) ?? { grossTotal: 0, userIds: new Set<string>() };
          current.grossTotal += Number(item.estimatedPay);
          current.userIds.add(item.userId);
          deptSplits.set(deptName, current);
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
          const current = deptSplits.get(deptName) ?? { grossTotal: 0, userIds: new Set<string>() };
          current.grossTotal += estPay;
          current.userIds.add(u.id);
          deptSplits.set(deptName, current);
        }
      }

      if (deptSplits.size === 0) {
        deptSplits.set('Operations', { grossTotal: 0, userIds: new Set<string>() });
      }

      for (const [deptName, data] of deptSplits.entries()) {
        const deptCode = deptName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'GEN';
        const batchNumber = `PR-${per.id.slice(0, 5).toUpperCase()}-${deptCode}`;
        activeRuns.push({
          id: per.id,
          batchId: batchNumber,
          batchNumber,
          employeeCount: data.userIds.size,
          startDate: per.startDate,
          endDate: per.endDate,
          type: per.type,
          department: deptName,
          grossTotal: data.grossTotal,
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
    // The HR -> Finance handoff is PayrollPeriod.status (OPEN -> GENERATED ->
    // LOCKED -> EXPORTED); lockPeriod is HR's "Send to Finance". processingStatus
    // is Finance's own pipeline (DRAFT -> VALIDATED -> ...), and DRAFT is exactly
    // the state Finance validates *from*, so rejecting on DRAFT locked Finance out
    // of every period HR had just handed over. Pending means HR is still working:
    // the period is OPEN, or GENERATED and untouched by Finance.
    if (
      period.status === 'OPEN' ||
      (period.status === 'GENERATED' && period.processingStatus === 'DRAFT')
    ) {
      throw new ForbiddenException('Pending HR Submission — HR is currently reviewing');
    }

    const report = await this.prisma.payrollReport.findFirst({
      where: { payrollPeriodId: periodId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        lineItems: {
          include: {
            user: {
              select: {
                id: true, firstName: true, lastName: true, email: true,
                jobTitle: true, employmentType: true, hourlyRate: true,
                payrollEligible: true, status: true, version: true,
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
    let taxWithheld = 0;

    const employees = lineItems.map((li) => {
      // `estimatedPay` is regular + overtime only. The true gross that tax and
      // contributions are assessed on is `grossTotal`, which adds the premiums
      // (see computeStatutoryFigures). Summing estimatedPay here understated
      // the payroll and made net pay exceed the "gross" shown in the table.
      const basePay = Number(li.estimatedPay);
      const grossTotal = Number(li.grossTotal);
      grossPayroll += grossTotal;
      taxWithheld += Number(li.incomeTaxWithheld);
      totalHours += Number(li.approvedHours) + Number(li.overtimeHours);
      const baseRate = Number(li.hourlyRate);
      const approvedHrs = Number(li.approvedHours);
      const overtimeHrs = Number(li.overtimeHours);
      const totalHrs = approvedHrs + overtimeHrs;
      const payMultiplier = baseRate > 0 && totalHrs > 0
        ? Number((basePay / (totalHrs * baseRate)).toFixed(2))
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
        // The user's current base rate + version, so Finance can edit it inline
        // (PATCH /payroll/rates/:userId uses optimistic concurrency). Distinct
        // from `hourlyRate` above, which is this period's snapshotted line-item
        // rate — they diverge after an edit until the report is regenerated.
        userHourlyRate: li.user.hourlyRate != null ? Number(li.user.hourlyRate) : null,
        userVersion: li.user.version,
        payrollEligible: li.user.payrollEligible,
        status: li.user.status,
        // `estimatedPay` stays the base (regular + OT) for backwards
        // compatibility; the premium components and the true gross are new.
        estimatedPay: basePay,
        basePay,
        holidayPay: Number(li.holidayPay),
        nightDifferential: Number(li.nightDifferential),
        restDayPay: Number(li.restDayPay),
        deMinimisTotal: Number(li.deMinimisTotal),
        grossTotal,
        contributions:
          Number(li.sssContribution) + Number(li.philhealthContribution) + Number(li.pagibigContribution),
        incomeTaxWithheld: Number(li.incomeTaxWithheld),
        netPay: Number(li.netPay),
        approvedHours: approvedHrs,
        pendingHours: Number(li.pendingHours),
        overtimeHours: overtimeHrs,
        payMultiplier,
        rowStatus: status,
        rejectedHours: Number(li.rejectedHours),
        lineItemId: li.id,
      };
    });

    // Was a flat `grossPayroll * 0.15` placeholder, which contradicted the
    // per-employee withholding the HR screen shows. Use the real BIR figure the
    // line items already carry so both screens quote the same number.
    const estimatedTax = round2(taxWithheld);

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
    await this.invalidateFinanceCache(p.organizationId);
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
    await this.invalidateFinanceCache(p.organizationId);
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
    await this.invalidateFinanceCache(p.organizationId);
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

      // BUG-AK: Mark all timesheets associated with this period as PAID.
      // BUG-AX/AY: prefer the explicit payrollPeriodId link set on supervisor approval;
      // fall back to the date range only for sheets not yet linked to any period, so a
      // neighbouring period's timesheets can never be marked PAID by this run.
      await tx.timesheet.updateMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          status: { in: ['APPROVED', 'PAYROLL_READY'] },
          deletedAt: null,
          OR: [
            { payrollPeriodId: periodId },
            {
              payrollPeriodId: null,
              periodStart: { gte: period.startDate },
              periodEnd: { lte: period.endDate },
            },
          ],
        },
        data: {
          paymentStatus: 'PAID',
          updatedBy: p.userId,
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

    await this.invalidateFinanceCache(p.organizationId);
    return { periodId, processingStatus: result.processingStatus };
  }

  // -- FEAT-3: statutory remittance / tax reporting --

  /**
   * Resolves the period a statutory report covers: the one requested, or the
   * most recently generated one when the caller does not name it.
   */
  private async resolveReportPeriod(p: AuthPrincipal, periodId?: string) {
    if (periodId) return this.findOnePeriod(p, periodId);

    const latest = await this.prisma.payrollPeriod.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: { not: 'OPEN' },
      },
      orderBy: { endDate: 'desc' },
    });
    if (!latest) throw new NotFoundException('No generated payroll period to report on');
    return latest;
  }

  private async reportLineItems(p: AuthPrincipal, periodId: string) {
    return this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        payrollReport: { payrollPeriodId: periodId },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            department: { select: { name: true } },
            // BUG-AZ — the agency portals key each line on the member's own
            // number, so the remittance reports carry them alongside the amounts.
            tin: true,
            sssNumber: true,
            philhealthNumber: true,
            pagibigNumber: true,
          },
        },
      },
      orderBy: { user: { lastName: 'asc' } },
    });
  }

  /**
   * Remittance report for one contribution agency — the per-employee employee/
   * employer split and the total the organization owes for the period.
   */
  async getContributionReport(
    p: AuthPrincipal,
    agency: 'SSS' | 'PHILHEALTH' | 'PAGIBIG',
    query: StatutoryReportQuery,
  ) {
    const period = await this.resolveReportPeriod(p, query.periodId);
    const items = await this.reportLineItems(p, period.id);

    const pick = (item: (typeof items)[number]) => {
      switch (agency) {
        case 'SSS':
          return { employee: item.sssContribution, employer: item.sssEmployerShare };
        case 'PHILHEALTH':
          return { employee: item.philhealthContribution, employer: item.philhealthEmployerShare };
        case 'PAGIBIG':
          return { employee: item.pagibigContribution, employer: item.pagibigEmployerShare };
      }
    };

    let employeeTotal = new Decimal(0);
    let employerTotal = new Decimal(0);

    // `grossTotal` is one period's gross. The contribution brackets are keyed on
    // the *monthly* basis (DeductionService.calculateAll multiplies by the same
    // factor before looking up the table, then divides the result back down), so
    // reporting the period gross under a "Monthly Basis" heading understated it
    // — a semi-monthly ₱27,007.50 is really a ₱54,015.00 monthly basis, which is
    // what hit the SSS ceiling. Agency portals expect the monthly figure too.
    const periodsInMonth = periodsPerMonth(period.type);

    const rows = items.map((item) => {
      const share = pick(item);
      employeeTotal = employeeTotal.add(share.employee);
      employerTotal = employerTotal.add(share.employer);
      return {
        userId: item.userId,
        email: item.user.email,
        name: `${item.user.lastName}, ${item.user.firstName}`,
        department: item.user.department?.name ?? null,
        // BUG-AZ — rendered in the agency's display mask so the reports screen
        // can show a clerk exactly what the portal expects. Blank when HR has
        // not captured that ID yet, which the screen flags as incomplete.
        memberNumber: formatStatutoryId(AGENCY_ID_FIELD[agency], item.user[AGENCY_ID_FIELD[agency]]),
        monthlyGrossBasis: new Decimal(item.grossTotal).mul(periodsInMonth).toFixed(2),
        employeeShare: share.employee.toFixed(2),
        employerShare: share.employer.toFixed(2),
        total: new Decimal(share.employee).add(share.employer).toFixed(2),
      };
    });

    return {
      agency,
      period: {
        id: period.id,
        startDate: period.startDate.toISOString().slice(0, 10),
        endDate: period.endDate.toISOString().slice(0, 10),
        status: period.status,
      },
      headcount: rows.length,
      totals: {
        employeeShare: employeeTotal.toFixed(2),
        employerShare: employerTotal.toFixed(2),
        grandTotal: employeeTotal.add(employerTotal).toFixed(2),
      },
      rows,
    };
  }

  /**
   * BIR withholding summary for the period — the figures that feed BIR Form
   * 1601-C, plus each employee's year-to-date position.
   */
  async getBirTaxSummary(p: AuthPrincipal, query: StatutoryReportQuery) {
    const period = await this.resolveReportPeriod(p, query.periodId);
    const items = await this.reportLineItems(p, period.id);
    const settings = await this.payrollSettings.forPrincipal(p);

    let grossTotal = new Decimal(0);
    let contributionTotal = new Decimal(0);
    let taxableTotal = new Decimal(0);
    let withheldTotal = new Decimal(0);

    const rows = items.map((item) => {
      const contributions = new Decimal(item.sssContribution)
        .add(item.philhealthContribution)
        .add(item.pagibigContribution);
      const taxable = Decimal.max(0, new Decimal(item.grossTotal).sub(contributions));

      grossTotal = grossTotal.add(item.grossTotal);
      contributionTotal = contributionTotal.add(contributions);
      taxableTotal = taxableTotal.add(taxable);
      withheldTotal = withheldTotal.add(item.incomeTaxWithheld);

      return {
        userId: item.userId,
        email: item.user.email,
        name: `${item.user.lastName}, ${item.user.firstName}`,
        // Carried so the reports screen can apply one department filter across
        // the contribution and BIR views alike.
        department: item.user.department?.name ?? null,
        grossCompensation: item.grossTotal.toFixed(2),
        mandatoryContributions: contributions.toFixed(2),
        taxableCompensation: taxable.toFixed(2),
        taxWithheld: item.incomeTaxWithheld.toFixed(2),
        ytdTaxableIncome: item.ytdTaxableIncome.toFixed(2),
        ytdTaxWithheld: item.ytdTaxWithheld.toFixed(2),
        isThirteenthMonth: item.isThirteenthMonth,
      };
    });

    return {
      taxYear: settings.birTaxTableYear,
      period: {
        id: period.id,
        startDate: period.startDate.toISOString().slice(0, 10),
        endDate: period.endDate.toISOString().slice(0, 10),
        status: period.status,
      },
      headcount: rows.length,
      totals: {
        grossCompensation: grossTotal.toFixed(2),
        mandatoryContributions: contributionTotal.toFixed(2),
        taxableCompensation: taxableTotal.toFixed(2),
        taxWithheld: withheldTotal.toFixed(2),
      },
      rows,
    };
  }

  /**
   * BUG-AZ — the contribution collection list for one agency, as a file the
   * clerk uploads to that agency's employer portal.
   *
   * Deliberately reads the amounts straight off the generated payroll line
   * items rather than recomputing: the remitted figure must be the one the
   * employee was actually deducted, or the remittance and the payslip disagree.
   */
  async exportContributionFile(
    p: AuthPrincipal,
    agency: 'SSS' | 'PHILHEALTH' | 'PAGIBIG',
    query: StatutoryExportQuery,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const period = await this.resolveReportPeriod(p, query.periodId);
    const items = await this.reportLineItems(p, period.id);

    const share = (item: (typeof items)[number]) => {
      switch (agency) {
        case 'SSS':
          return { employee: item.sssContribution, employer: item.sssEmployerShare };
        case 'PHILHEALTH':
          return { employee: item.philhealthContribution, employer: item.philhealthEmployerShare };
        case 'PAGIBIG':
          return { employee: item.pagibigContribution, employer: item.pagibigEmployerShare };
      }
    };

    const scoped = query.departmentId
      ? items.filter((i) => i.user.department?.name === query.departmentId)
      : items;

    // Same as the on-screen report: portals expect the monthly basis the
    // brackets were keyed on, not one period's gross.
    const periodsInMonth = periodsPerMonth(period.type);

    const rows: StatutoryExportRow[] = scoped.map((item) => {
      const s = share(item);
      return {
        lastName: item.user.lastName,
        firstName: item.user.firstName,
        tin: item.user.tin,
        sssNumber: item.user.sssNumber,
        philhealthNumber: item.user.philhealthNumber,
        pagibigNumber: item.user.pagibigNumber,
        monthlyGrossBasis: new Decimal(item.grossTotal).mul(periodsInMonth).toFixed(2),
        employeeShare: s.employee.toFixed(2),
        employerShare: s.employer.toFixed(2),
        total: new Decimal(s.employee).add(s.employer).toFixed(2),
      };
    });

    const sheet = buildContributionSheet(agency, rows, period.startDate.toISOString().slice(0, 10));

    // Exporting a remittance list moves employee government IDs off the
    // platform, so it goes in the audit log the same way a payslip export does (H1).
    await this.prisma.auditLog
      .create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: AuditAction.ADMIN_ACTION,
          entityType: 'statutory_report_export',
          entityId: period.id,
          metadata: {
            agency,
            format: query.format === 'xlsx' ? 'XLSX' : 'CSV',
            headcount: rows.length,
            departmentId: query.departmentId ?? null,
          },
        },
      })
      .catch(() => {});

    if (query.format === 'xlsx') {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet(agency);
      ws.addRow(sheet.header).font = { bold: true };
      for (const r of sheet.rows) ws.addRow(r);
      ws.addRow(sheet.totalRow).font = { bold: true };
      ws.columns.forEach((c) => {
        c.width = 24;
      });
      const buf = await workbook.xlsx.writeBuffer();
      return {
        buffer: Buffer.from(buf),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${sheet.filenameStem}.xlsx`,
      };
    }

    return {
      buffer: sheetToCsv(sheet),
      contentType: 'text/csv; charset=utf-8',
      filename: `${sheet.filenameStem}.csv`,
    };
  }

  // -- Private helpers --

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }
}
