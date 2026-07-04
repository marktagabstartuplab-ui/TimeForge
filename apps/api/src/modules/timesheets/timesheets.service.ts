import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Timesheet, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import {
  AttachEntriesDto,
  CreateTimesheetDto,
  SubmitTimesheetDto,
  TimesheetHistoryQuery,
  TimesheetHistoryRow,
  TimesheetQuery,
  UpdateTimesheetDto,
} from './dto';

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  // -- Reads --

  async findAll(p: AuthPrincipal, query: TimesheetQuery): Promise<PageResult<Timesheet>> {
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
    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  async findOne(p: AuthPrincipal, id: string): Promise<Timesheet> {
    const sheet = await this.prisma.timesheet.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.assertCanView(p, sheet.userId);
    return sheet;
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
   * DRAFT | REVISION_REQUESTED -> SUBMITTED.
   * Recalculates totalMinutes from currently attached, non-deleted entries.
   */
  async submit(p: AuthPrincipal, id: string, dto: SubmitTimesheetDto): Promise<Timesheet> {
    const sheet = await this.ownSheet(p, id);
    if (sheet.status !== 'DRAFT' && sheet.status !== 'REVISION_REQUESTED') {
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

    return this.prisma.timesheet.update({
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

  private async teamUserIds(p: AuthPrincipal): Promise<string[]> {
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        supervisorId: p.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return [p.userId, ...reports.map((r) => r.id)];
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
