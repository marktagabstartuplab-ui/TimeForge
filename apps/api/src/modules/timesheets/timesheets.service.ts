import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, Prisma, Timesheet, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { PERMISSIONS } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  AttachEntriesDto,
  BulkApproveTimesheetsDto,
  BulkRejectTimesheetsDto,
  CreateTimesheetDto,
  SubmitTimesheetDto,
  TimesheetChartQuery,
  TimesheetHistoryQuery,
  TimesheetHistoryRow,
  TimesheetQuery,
  TimesheetStatsQuery,
  UpdateTimesheetDto,
} from './dto';

const SORTABLE_FIELDS = ['periodStart', 'totalMinutes', 'status', 'submittedAt'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

/** A timesheet's total minutes exceeding this, pro-rated for its period length, is flagged as overtime. */
const WEEKLY_OVERTIME_CAP_MINUTES = 60 * 60;

export interface BulkTimesheetResult {
  results: { id: string; status: 'ok' | 'error'; error?: string }[];
}

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
    private readonly deptScope: DepartmentScopeService,
  ) {}

  // -- Reads --

  async findAll(p: AuthPrincipal, query: TimesheetQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(await this.resolveUserFilter(p, query.userId)),
      ...(query.status ? { status: query.status as TimesheetStatus } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };

    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = this.intersectUserFilter(where.userId, deptUserIds);
    }
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const sortField = this.resolveSortField(query.sortBy);
    const sortDir: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';

    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ [sortField]: sortDir }, { id: 'asc' }],
      take: limit + 1,
      include: { user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
    });
    return buildPage(items, limit);
  }

  /** Stat cards: Total Timesheets, Completion Rate, Pending Approval, Flagged Entries. */
  async stats(p: AuthPrincipal, query: TimesheetStatsQuery) {
    const scopeFilter = await this.resolveUserFilter(p, undefined);
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...scopeFilter,
      ...(query.from || query.to
        ? { periodStart: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = this.intersectUserFilter(where.userId, deptUserIds);
    }

    const [total, byStatus, overdue, allForOvertime] = await Promise.all([
      this.prisma.timesheet.count({ where }),
      this.prisma.timesheet.groupBy({ by: ['status'], where, _count: { id: true } }),
      this.prisma.timesheet.count({
        where: { ...where, status: 'DRAFT', periodEnd: { lt: this.startOfDay(new Date()) } },
      }),
      this.prisma.timesheet.findMany({
        where,
        select: { id: true, totalMinutes: true, periodStart: true, periodEnd: true },
      }),
    ]);

    const byStatusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count.id]));
    const completed = (byStatusMap['APPROVED'] ?? 0) + (byStatusMap['PAYROLL_READY'] ?? 0);
    const nonDraft = total - (byStatusMap['DRAFT'] ?? 0);
    const pendingApproval = (byStatusMap['SUBMITTED'] ?? 0) + (byStatusMap['UNDER_REVIEW'] ?? 0);

    const overtimeFlagged = allForOvertime.filter((t) => this.isOvertimeFlagged(t)).length;

    return {
      totalTimesheets: total,
      completionRate: nonDraft > 0 ? +((completed / nonDraft) * 100).toFixed(1) : 0,
      pendingApproval,
      flaggedEntries: overdue + overtimeFlagged,
      overdueCount: overdue,
      overtimeCount: overtimeFlagged,
      byStatus: byStatusMap,
    };
  }

  /** Weekly submissions (last N weeks) + monthly trend (last N months). */
  async chart(p: AuthPrincipal, query: TimesheetChartQuery) {
    const scopeFilter = await this.resolveUserFilter(p, undefined);
    const weeks = Math.min(Math.max(Number(query.weeks ?? 4), 1), 26);
    const months = Math.min(Math.max(Number(query.months ?? 6), 1), 24);

    const weeksAgo = this.startOfDay(new Date());
    weeksAgo.setUTCDate(weeksAgo.getUTCDate() - weeks * 7);
    const monthsAgo = new Date();
    monthsAgo.setUTCDate(1);
    monthsAgo.setUTCHours(0, 0, 0, 0);
    monthsAgo.setUTCMonth(monthsAgo.getUTCMonth() - (months - 1));

    const since = weeksAgo < monthsAgo ? weeksAgo : monthsAgo;
    const submitted = await this.prisma.timesheet.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, ...scopeFilter, submittedAt: { gte: since } },
      select: { submittedAt: true },
    });

    const weekBuckets = new Map<string, number>();
    for (let i = 0; i < weeks; i++) {
      const d = new Date(weeksAgo);
      d.setUTCDate(d.getUTCDate() + i * 7);
      weekBuckets.set(this.toIsoWeek(d), 0);
    }
    const monthBuckets = new Map<string, number>();
    for (let i = 0; i < months; i++) {
      const d = new Date(monthsAgo);
      d.setUTCMonth(d.getUTCMonth() + i);
      monthBuckets.set(d.toISOString().slice(0, 7), 0);
    }

    for (const t of submitted) {
      if (!t.submittedAt) continue;
      const weekKey = this.toIsoWeek(t.submittedAt);
      if (weekBuckets.has(weekKey)) weekBuckets.set(weekKey, (weekBuckets.get(weekKey) ?? 0) + 1);
      const monthKey = t.submittedAt.toISOString().slice(0, 7);
      if (monthBuckets.has(monthKey)) monthBuckets.set(monthKey, (monthBuckets.get(monthKey) ?? 0) + 1);
    }

    return {
      weeklySubmissions: Array.from(weekBuckets.entries()).map(([week, count]) => ({ week, count })),
      monthlyTrend: Array.from(monthBuckets.entries()).map(([month, count]) => ({ month, count })),
    };
  }

  // -- Bulk approval workflow (delegates to ApprovalsService.decide() per item —
  // the sole enforcement path for self-approval prevention, team scope, KPI
  // updates, and audit logging; see docs/Backend-RC-Review.md C1). --

  async bulkApprove(p: AuthPrincipal, dto: BulkApproveTimesheetsDto): Promise<BulkTimesheetResult> {
    return this.runBulkDecision(p, dto.items, 'APPROVE');
  }

  async bulkReject(p: AuthPrincipal, dto: BulkRejectTimesheetsDto): Promise<BulkTimesheetResult> {
    return this.runBulkDecision(
      p,
      dto.items.map((i) => ({ ...i, remark: dto.remark })),
      'REJECT',
    );
  }

  private async runBulkDecision(
    p: AuthPrincipal,
    items: { timesheetId: string; expectedVersion: number; remark?: string }[],
    action: 'APPROVE' | 'REJECT',
  ): Promise<BulkTimesheetResult> {
    const MAX_BULK_SIZE = 100;
    if (items.length > MAX_BULK_SIZE) {
      throw new UnprocessableEntityException(`Bulk ${action.toLowerCase()} limited to ${MAX_BULK_SIZE} items per request`);
    }

    const results: BulkTimesheetResult['results'] = [];
    for (const item of items) {
      try {
        await this.approvals.decide(p, item.timesheetId, {
          action,
          expectedVersion: item.expectedVersion,
          remark: item.remark,
        });
        results.push({ id: item.timesheetId, status: 'ok' });
      } catch (err: unknown) {
        results.push({ id: item.timesheetId, status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: action === 'APPROVE' ? AuditAction.APPROVE : AuditAction.REJECT,
        entityType: 'bulk_timesheet_decision',
        metadata: {
          action,
          total: items.length,
          ok: results.filter((r) => r.status === 'ok').length,
          errors: results.filter((r) => r.status === 'error').length,
        },
      },
    });

    return { results };
  }

  async findOne(p: AuthPrincipal, id: string): Promise<Timesheet> {
    const sheet = await this.prisma.timesheet.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.assertCanView(p, sheet.userId);
    return sheet;
  }

  async findOneDetail(p: AuthPrincipal, id: string) {
    const sheet = await this.prisma.timesheet.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        entries: {
          where: { deletedAt: null },
          orderBy: { startTime: 'asc' },
        },
        approvals: {
          orderBy: { createdAt: 'desc' },
          include: { supervisor: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.assertCanView(p, sheet.userId);
    return sheet;
  }

  async findPending(p: AuthPrincipal, query: TimesheetQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      ...(await this.resolveUserFilter(p, query.userId)),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };

    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = this.intersectUserFilter(where.userId, deptUserIds);
    }
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      include: { user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
    });
    return buildPage(items, limit);
  }

  /**
   * Per-day rollup for "My Timesheet History" — computed entirely server-side
   * from WorkSession (break bookkeeping) + TimeEntry (worked segments).
   */
  async history(p: AuthPrincipal, query: TimesheetHistoryQuery): Promise<TimesheetHistoryRow[]> {
    const userId = await this.resolveHistoryUserId(p, query.userId);
    const { from, to } = this.historyRange(query);

    const [sessions, entries] = await Promise.all([
      this.prisma.workSession.findMany({
        where: { tenantId: p.tenantId, userId, workDate: { gte: from, lte: to } },
      }),
      this.prisma.timeEntry.findMany({
        where: { tenantId: p.tenantId, userId, deletedAt: null, startTime: { gte: from, lte: this.endOfDay(to) } },
      }),
    ]);

    const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

    const buckets = new Map<
      string,
      { clockIn: Date | null; clockOut: Date | null; workMinutes: number; breakMinutes: number; active: boolean }
    >();

    for (const s of sessions) {
      const key = dayKey(s.workDate);
      const b = buckets.get(key) ?? { clockIn: null, clockOut: null, workMinutes: 0, breakMinutes: 0, active: false };
      b.breakMinutes += s.breakMinutes;
      if (s.isActive) b.active = true;
      buckets.set(key, b);
    }

    for (const e of entries) {
      const key = dayKey(e.startTime);
      const b = buckets.get(key) ?? { clockIn: null, clockOut: null, workMinutes: 0, breakMinutes: 0, active: false };
      b.workMinutes += e.durationMinutes ?? 0;
      if (!b.clockIn || e.startTime < b.clockIn) b.clockIn = e.startTime;
      if (!e.endTime) {
        b.active = true;
      } else if (!b.clockOut || e.endTime > b.clockOut) {
        b.clockOut = e.endTime;
      }
      buckets.set(key, b);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, b]) => ({
        date,
        clockIn: b.clockIn?.toISOString() ?? null,
        clockOut: b.active ? null : (b.clockOut?.toISOString() ?? null),
        workMinutes: b.workMinutes,
        breakMinutes: b.breakMinutes,
        totalMinutes: b.workMinutes + b.breakMinutes,
        status: b.active ? 'ACTIVE' : ('COMPLETE' as const),
      }));
  }

  async historyCsv(p: AuthPrincipal, query: TimesheetHistoryQuery): Promise<string> {
    const rows = await this.history(p, query);
    const header = 'Date,Clock In,Clock Out,Work Hours,Break Hours,Total Hours,Status';
    const lines = rows.map((r) =>
      [
        r.date,
        r.clockIn ?? '',
        r.clockOut ?? '',
        (r.workMinutes / 60).toFixed(2),
        (r.breakMinutes / 60).toFixed(2),
        (r.totalMinutes / 60).toFixed(2),
        r.status,
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  // -- Employee writes --

  async create(p: AuthPrincipal, dto: CreateTimesheetDto): Promise<Timesheet> {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new UnprocessableEntityException('periodStart and periodEnd must be valid dates');
    }
    if (end <= start) throw new UnprocessableEntityException('periodEnd must be after periodStart');

    // Reject exact duplicate period for the same user
    const conflict = await this.prisma.timesheet.findFirst({
      where: {
        tenantId: p.tenantId,
        userId: p.userId,
        periodStart: start,
        periodEnd: end,
        deletedAt: null,
      },
    });
    if (conflict) throw new ConflictException('A timesheet for this exact period already exists');

    return this.prisma.timesheet.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        status: 'DRAFT',
        periodStart: start,
        periodEnd: end,
        totalMinutes: 0,
        summary: dto.summary ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateTimesheetDto): Promise<Timesheet> {
    const sheet = await this.ownSheet(p, id);
    this.assertDraft(sheet);
    if (sheet.version !== dto.version) throw new ConflictException('Version mismatch');

    return this.prisma.timesheet.update({
      where: { id },
      data: {
        summary: dto.summary ?? sheet.summary,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  /**
   * DRAFT | REVISION_REQUESTED | REJECTED -> SUBMITTED.
   * Recalculates totalMinutes from currently attached, non-deleted entries.
   */
  async submit(p: AuthPrincipal, id: string, dto: SubmitTimesheetDto): Promise<Timesheet> {
    const sheet = await this.ownSheet(p, id);
    if (sheet.status !== 'DRAFT' && sheet.status !== 'REVISION_REQUESTED' && sheet.status !== 'REJECTED') {
      throw new ConflictException(
        `Cannot submit a timesheet with status ${sheet.status}`,
      );
    }
    if (sheet.version !== dto.version) throw new ConflictException('Version mismatch');

    const agg = await this.prisma.timeEntry.aggregate({
      where: { timesheetId: id, deletedAt: null },
      _sum: { durationMinutes: true },
    });
    const totalMinutes = agg._sum.durationMinutes ?? 0;

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        totalMinutes,
        summary: dto.summary ?? sheet.summary,
        submittedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    const employee = await this.prisma.user.findFirst({ where: { id: p.userId }, select: { supervisorId: true } });
    if (employee?.supervisorId) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: employee.supervisorId,
        senderId: p.userId,
        type: 'SUBMISSION',
        category: 'TIMESHEETS',
        title: 'Timesheet submitted',
        message: 'A timesheet was submitted and is awaiting your review.',
        actionUrl: '/timesheets',
        actionLabel: 'Review Now',
      });
    }

    return updated;
  }

  // NOTE (C1 fix): the SUBMITTED|UNDER_REVIEW -> APPROVED/REJECTED/REVISION_REQUESTED
  // decide() transition has been removed from here. It is handled exclusively by
  // ApprovalsService.decide() (POST /approvals/:timesheetId/decision), which is the
  // only path enforcing self-approval prevention, team scope, Approval history, KPI
  // updates, and audit logging. See docs/Backend-RC-Review.md C1.

  /**
   * APPROVED -> PAYROLL_READY.
   * Requires payroll:generate permission (Finance / Admin).
   */
  async markPayrollReady(p: AuthPrincipal, id: string): Promise<Timesheet> {
    const sheet = await this.prisma.timesheet.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    if (sheet.status !== 'APPROVED') {
      throw new ConflictException('Only APPROVED timesheets can be marked payroll-ready');
    }
    return this.prisma.timesheet.update({
      where: { id },
      data: {
        status: 'PAYROLL_READY',
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Links unattached TimeEntries (owned by same user) to a DRAFT timesheet.
   * Entries already attached to another timesheet are rejected.
   */
  async attachEntries(
    p: AuthPrincipal,
    id: string,
    dto: AttachEntriesDto,
  ): Promise<Timesheet> {
    const sheet = await this.ownSheet(p, id);
    this.assertDraft(sheet);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        id: { in: dto.entryIds },
        tenantId: p.tenantId,
        userId: p.userId,
        deletedAt: null,
      },
    });
    if (entries.length !== dto.entryIds.length) {
      throw new UnprocessableEntityException(
        'One or more entry IDs are invalid or inaccessible',
      );
    }
    const alreadyAttached = entries.filter(
      (e) => e.timesheetId !== null && e.timesheetId !== id,
    );
    if (alreadyAttached.length > 0) {
      throw new ConflictException(
        'One or more entries are already attached to another timesheet',
      );
    }

    await this.prisma.timeEntry.updateMany({
      where: { id: { in: dto.entryIds } },
      data: { timesheetId: id, updatedBy: p.userId, version: { increment: 1 } },
    });

    return this.prisma.timesheet.findUniqueOrThrow({ where: { id } });
  }

  /** Removes a single entry from a DRAFT timesheet (sets timesheetId = null). */
  async detachEntry(
    p: AuthPrincipal,
    timesheetId: string,
    entryId: string,
  ): Promise<void> {
    const sheet = await this.ownSheet(p, timesheetId);
    this.assertDraft(sheet);

    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: entryId, timesheetId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Entry not found on this timesheet');

    await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: { timesheetId: null, updatedBy: p.userId, version: { increment: 1 } },
    });
  }

  /** Soft-deletes a DRAFT timesheet and detaches all its entries. */
  async remove(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const sheet = await this.ownSheet(p, id);
    this.assertDraft(sheet);
    if (sheet.version !== version) throw new ConflictException('Version mismatch');

    // Detach all entries so they remain available
    await this.prisma.timeEntry.updateMany({
      where: { timesheetId: id },
      data: { timesheetId: null },
    });

    await this.prisma.timesheet.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId, version: { increment: 1 } },
    });
  }

  // ─── HR Timesheet review (read-only, org-wide) ─────────────────────────

  async hrFindAll(p: AuthPrincipal, query: TimesheetQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status as TimesheetStatus } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };

    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = { in: deptUserIds };
    }
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const sortField = this.resolveSortField(query.sortBy);
    const sortDir: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';

    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ [sortField]: sortDir }, { id: 'asc' }],
      take: limit + 1,
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        approvals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { supervisor: { select: { firstName: true, lastName: true } } },
        },
        _count: { select: { entries: true } },
      },
    });

    const data = items.map((t) => ({
      id: t.id,
      userId: t.userId,
      employee: `${t.user.firstName} ${t.user.lastName}`,
      department: t.user.department?.name ?? null,
      periodStart: t.periodStart.toISOString(),
      periodEnd: t.periodEnd.toISOString(),
      totalMinutes: t.totalMinutes,
      totalHours: +(t.totalMinutes / 60).toFixed(2),
      status: t.status,
      summary: t.summary,
      submittedAt: t.submittedAt?.toISOString() ?? null,
      decidedAt: t.decidedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      version: t.version,
      entriesCount: t._count.entries,
      supervisorRemark: t.approvals[0]?.remark ?? null,
      supervisorName: t.approvals[0]
        ? `${t.approvals[0].supervisor.firstName} ${t.approvals[0].supervisor.lastName}`
        : null,
      lastAction: t.approvals[0]?.lastAction ?? null,
      actedAt: t.approvals[0]?.actedAt.toISOString() ?? null,
    }));

    return buildPage(data, limit);
  }

  async hrStats(p: AuthPrincipal, query: TimesheetStatsQuery) {
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.from || query.to
        ? { periodStart: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = { in: deptUserIds };
    }

    const [totalEmployees, timesheetAgg, byStatus] = await Promise.all([
      this.prisma.user.count({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          deletedAt: null,
          status: 'ACTIVE',
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      }),
      this.prisma.timesheet.aggregate({
        where,
        _sum: { totalMinutes: true },
      }),
      this.prisma.timesheet.groupBy({ by: ['status'], where, _count: { id: true } }),
    ]);

    const byStatusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count.id]));
    const totalTimesheets = Object.values(byStatusMap).reduce((a, b) => a + b, 0);
    const hoursLogged = Math.round((timesheetAgg._sum.totalMinutes ?? 0) / 60);
    const pendingApproval = (byStatusMap['SUBMITTED'] ?? 0) + (byStatusMap['UNDER_REVIEW'] ?? 0);

    const flaggedSheets = await this.prisma.timesheet.findMany({
      where: { ...where, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'REJECTED'] } },
      select: { id: true, totalMinutes: true, periodStart: true, periodEnd: true, status: true },
    });
    const flaggedRemarks = flaggedSheets.filter(
      (t) => t.status === 'REVISION_REQUESTED' || t.status === 'REJECTED' || this.isOvertimeFlagged(t),
    ).length;

    return { totalEmployees, hoursLogged, pendingApproval, flaggedRemarks, totalTimesheets };
  }

  async hrExportCsv(p: AuthPrincipal, query: TimesheetQuery) {
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status as TimesheetStatus } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = { in: deptUserIds };
    }
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
      take: 10000,
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        approvals: { orderBy: { createdAt: 'desc' }, take: 1, include: { supervisor: { select: { firstName: true, lastName: true } } } },
      },
    });

    const header = 'Employee,Department,Period Start,Period End,Total Hours,Status,Submitted At,Supervisor Remark,Last Action,Acted At';
    const rows = items.map((t) => {
      const remark = t.approvals[0]?.remark ?? '';
      const supervisor = t.approvals[0]
        ? `${t.approvals[0].supervisor.firstName} ${t.approvals[0].supervisor.lastName}`
        : '';
      return [
        `"${t.user.firstName} ${t.user.lastName}"`,
        `"${t.user.department?.name ?? ''}"`,
        t.periodStart.toISOString().slice(0, 10),
        t.periodEnd.toISOString().slice(0, 10),
        (t.totalMinutes / 60).toFixed(2),
        t.status,
        t.submittedAt?.toISOString() ?? '',
        `"${remark.replace(/"/g, '""')}"`,
        t.approvals[0]?.lastAction ?? '',
        t.approvals[0]?.actedAt.toISOString() ?? '',
      ].join(',');
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'timesheet_hr_export',
        metadata: { filter: { departmentId: query.departmentId, status: query.status, from: query.from, to: query.to } },
      },
    });

    return [header, ...rows].join('\n');
  }

  async hrExportExcel(p: AuthPrincipal, query: TimesheetQuery): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const where = await this.buildHrExportWhere(p, query);
    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
      take: 10000,
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        approvals: { orderBy: { createdAt: 'desc' }, take: 1, include: { supervisor: { select: { firstName: true, lastName: true } } } },
      },
    });

    await this.prisma.auditLog.create({
      data: { tenantId: p.tenantId, actorId: p.userId, action: AuditAction.ADMIN_ACTION, entityType: 'timesheet_hr_export', metadata: { format: 'XLSX', count: items.length, filter: { departmentId: query.departmentId, status: query.status, from: query.from, to: query.to } } },
    });

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Timesheets');
    ws.columns = [
      { header: 'Employee', key: 'employee', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Total Hours', key: 'totalHours', width: 14 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Supervisor', key: 'supervisor', width: 20 },
      { header: 'Remark', key: 'remark', width: 30 },
    ];
    for (const t of items) {
      ws.addRow({
        employee: `${t.user.firstName} ${t.user.lastName}`,
        department: t.user.department?.name ?? '',
        date: t.periodEnd.toISOString().slice(0, 10),
        totalHours: +(t.totalMinutes / 60).toFixed(2),
        status: t.status,
        supervisor: t.approvals[0] ? `${t.approvals[0].supervisor.firstName} ${t.approvals[0].supervisor.lastName}` : '',
        remark: t.approvals[0]?.remark ?? '',
      });
    }
    const buf = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buf as ArrayBuffer), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `hr-timesheets-${new Date().toISOString().slice(0, 10)}.xlsx` };
  }

  async hrExportPdf(p: AuthPrincipal, query: TimesheetQuery): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const where = await this.buildHrExportWhere(p, query);
    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
      take: 10000,
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        approvals: { orderBy: { createdAt: 'desc' }, take: 1, include: { supervisor: { select: { firstName: true, lastName: true } } } },
      },
    });

    await this.prisma.auditLog.create({
      data: { tenantId: p.tenantId, actorId: p.userId, action: AuditAction.ADMIN_ACTION, entityType: 'timesheet_hr_export', metadata: { format: 'PDF', count: items.length, filter: { departmentId: query.departmentId, status: query.status, from: query.from, to: query.to } } },
    });

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.fontSize(18).text('HR Timesheet Report', { align: 'center' });
    doc.fontSize(10).text(`Generated ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
    doc.moveDown(1);
    const cols = ['Employee', 'Department', 'Date', 'Hours', 'Status', 'Supervisor', 'Remark'];
    const colW = [140, 100, 80, 60, 90, 110, 200];
    const drawRow = (vals: string[], isHeader: boolean) => {
      let x = 30;
      if (isHeader) doc.fontSize(8).font('Helvetica-Bold');
      else doc.fontSize(7).font('Helvetica');
      vals.forEach((v, i) => { doc.text(v, x, doc.y, { width: colW[i], lineBreak: false }); x += colW[i]; });
      doc.moveDown(0.4);
    };
    drawRow(cols, true);
    doc.moveDown(0.1);
    for (const t of items) {
      const supervisor = t.approvals[0] ? `${t.approvals[0].supervisor.firstName} ${t.approvals[0].supervisor.lastName}` : '';
      drawRow([`${t.user.firstName} ${t.user.lastName}`, t.user.department?.name ?? '', t.periodEnd.toISOString().slice(0, 10), (t.totalMinutes / 60).toFixed(2), t.status, supervisor, (t.approvals[0]?.remark ?? '').slice(0, 50)], false);
    }
    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    return { buffer, contentType: 'application/pdf', filename: `hr-timesheets-${new Date().toISOString().slice(0, 10)}.pdf` };
  }

  private async buildHrExportWhere(p: AuthPrincipal, query: TimesheetQuery): Promise<Prisma.TimesheetWhereInput> {
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status as TimesheetStatus } : {}),
      ...(query.from || query.to
        ? { periodStart: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    if (query.departmentId) {
      const deptUserIds = await this.departmentUserIds(p, query.departmentId);
      where.userId = { in: deptUserIds };
    }
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    return where;
  }

  // -- Private helpers --

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async resolveUserFilter(
    p: AuthPrincipal,
    requestedUserId?: string,
  ): Promise<Prisma.TimesheetWhereInput> {
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)) {
      return requestedUserId ? { userId: requestedUserId } : {};
    }
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (requestedUserId && !ids.includes(requestedUserId)) {
        throw new ForbiddenException('That user is outside your team');
      }
      return { userId: requestedUserId ?? { in: ids } };
    }
    if (requestedUserId && requestedUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own timesheets');
    }
    return { userId: p.userId };
  }

  private async assertCanView(p: AuthPrincipal, ownerId: string): Promise<void> {
    if (ownerId === p.userId) return;
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)) return;
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_TEAM)) {
      if ((await this.teamUserIds(p)).includes(ownerId)) return;
    }
    throw new ForbiddenException('Not permitted to view this timesheet');
  }

  private resolveSortField(sortBy?: string): SortableField {
    return (SORTABLE_FIELDS as readonly string[]).includes(sortBy ?? '') ? (sortBy as SortableField) : 'periodStart';
  }

  private async departmentUserIds(p: AuthPrincipal, departmentId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, departmentId, deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /** Intersects an existing userId filter (string | {in: string[]} | undefined) with a new id list. */
  private intersectUserFilter(
    existing: Prisma.TimesheetWhereInput['userId'],
    withIds: string[],
  ): Prisma.TimesheetWhereInput['userId'] {
    if (!existing) return { in: withIds };
    if (typeof existing === 'string') return withIds.includes(existing) ? existing : { in: [] };
    if (existing && typeof existing === 'object' && 'in' in existing && Array.isArray(existing.in)) {
      return { in: existing.in.filter((id) => withIds.includes(id)) };
    }
    return { in: withIds };
  }

  /** Weekly-prorated 60-hour overtime cap, scaled to the timesheet's actual period length. */
  private isOvertimeFlagged(t: { totalMinutes: number; periodStart: Date; periodEnd: Date }): boolean {
    const days = Math.max(1, Math.round((t.periodEnd.getTime() - t.periodStart.getTime()) / 86_400_000) + 1);
    const cap = WEEKLY_OVERTIME_CAP_MINUTES * (days / 7);
    return t.totalMinutes > cap;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private toIsoWeek(date: Date): string {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const year = d.getUTCFullYear();
    const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  /** Department-based supervision scope (Department.managerId). */
  private teamUserIds(p: AuthPrincipal): Promise<string[]> {
    return this.deptScope.teamUserIds(p);
  }

  /** Fetches a timesheet and asserts the caller is the owner. */
  private async ownSheet(p: AuthPrincipal, id: string): Promise<Timesheet> {
    const sheet = await this.prisma.timesheet.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    if (sheet.userId !== p.userId) {
      throw new ForbiddenException('You can only modify your own timesheets');
    }
    return sheet;
  }

  private async resolveHistoryUserId(p: AuthPrincipal, requestedUserId?: string): Promise<string> {
    if (!requestedUserId || requestedUserId === p.userId) return p.userId;
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)) return requestedUserId;
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (!ids.includes(requestedUserId)) throw new ForbiddenException('That user is outside your team');
      return requestedUserId;
    }
    throw new ForbiddenException('You can only view your own timesheet history');
  }

  private historyRange(query: TimesheetHistoryQuery): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    to.setUTCHours(0, 0, 0, 0);
    let from: Date;
    switch (query.range) {
      case '30d':
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 29);
        break;
      case 'month':
        from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
        break;
      case 'custom':
        from = query.from ? new Date(query.from) : new Date(to);
        from.setUTCHours(0, 0, 0, 0);
        break;
      case '7d':
      default:
        from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 6);
    }
    return { from, to };
  }

  private endOfDay(d: Date): Date {
    const end = new Date(d);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }

  /** Throws if the timesheet is not in DRAFT status. */
  private assertDraft(sheet: Timesheet): void {
    if (sheet.status !== 'DRAFT') {
      throw new ConflictException(
        `This operation requires DRAFT status; current status is ${sheet.status}`,
      );
    }
  }
}
