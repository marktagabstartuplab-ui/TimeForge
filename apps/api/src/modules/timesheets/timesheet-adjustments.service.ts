import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, Prisma, TimeEntry, Timesheet, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { PERMISSIONS, orgDayKey } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { AdjustEntryDto, AdjustTimesheetDto } from './dto';

/** Minutes past which a day's logged time counts as overtime — matches PayrollService. */
const REGULAR_DAY_MINUTES = 8 * 60;

/** Statuses a timesheet may be adjusted in: only while it is under review. */
const ADJUSTABLE_STATUSES: TimesheetStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

interface EntrySnapshot {
  id: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  submittedMinutes?: number | null;
  approvedMinutes?: number | null;
  rejectedMinutes?: number | null;
  rejectionReason?: string | null;
}

/**
 * Supervisor-initiated corrections to an employee's submitted time record
 * (BUG-Q) — a forgotten clock-out showing 12h instead of 8h, say.
 *
 * This is intentionally its own service, endpoint, and permission rather than a
 * loosening of the employee self-edit path in TimeTrackingService.update():
 *
 *  - TimeTrackingService.update() is owner-only (`ownEntry`) and refuses to touch
 *    an entry once its timesheet leaves DRAFT. That stays exactly as it is.
 *  - This path is the mirror image: it only ever acts on *someone else's* entries,
 *    only while the timesheet is under review, only with `timesheet:adjust_team`,
 *    and only with a written reason.
 *
 * The audit trail therefore never has to guess which of the two happened — an
 * employee edit is AuditAction.ADMIN_ACTION on `time_entry`, a supervisor
 * override is AuditAction.TIME_ADJUSTMENT on `timesheet` with before/after
 * values, the supervisor's id, and the reason text.
 */
@Injectable()
export class TimesheetAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly deptScope: DepartmentScopeService,
    private readonly timeZones: OrgTimeZoneService,
  ) {}

  async adjust(p: AuthPrincipal, timesheetId: string, dto: AdjustTimesheetDto) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new UnprocessableEntityException('A reason for the adjustment is required');
    }

    const sheet = await this.prisma.timesheet.findFirst({
      where: {
        id: timesheetId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
      },
      include: { entries: { where: { deletedAt: null }, orderBy: { startTime: 'asc' } } },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');

    // A supervisor may not "correct" their own record — same principle as the
    // no-self-approval rule (BR-APP-04) this action sits next to.
    if (sheet.userId === p.userId) {
      throw new ForbiddenException('You cannot adjust your own timesheet');
    }
    await this.assertCanAdjust(p, sheet);

    if (!ADJUSTABLE_STATUSES.includes(sheet.status)) {
      throw new ConflictException(
        `Only a timesheet under review can be adjusted; this one is ${sheet.status}`,
      );
    }
    if (sheet.version !== dto.expectedVersion) {
      throw new ConflictException('Version mismatch -- please refresh and retry');
    }

    const entryUpdates = this.resolveEntryUpdates(sheet.entries, dto.entries ?? []);

    // Totals after the adjustment, so the override can be validated against them
    // and the timesheet's own totalMinutes stays the sum of its entries.
    const durationsAfter = new Map(
      sheet.entries.map((e) => [e.id, e.durationMinutes ?? 0] as const),
    );
    for (const u of entryUpdates) durationsAfter.set(u.id, u.durationMinutes ?? 0);
    const totalMinutesAfter = [...durationsAfter.values()].reduce((a, b) => a + b, 0);

    const overtimeOverrideAfter =
      dto.overtimeMinutesOverride === undefined
        ? sheet.overtimeMinutesOverride
        : dto.overtimeMinutesOverride;
    if (overtimeOverrideAfter !== null && overtimeOverrideAfter > totalMinutesAfter) {
      throw new UnprocessableEntityException(
        'Overtime cannot exceed the total hours on the timesheet',
      );
    }

    const timeZone = await this.timeZones.forPrincipal(p);

    const before = {
      totalMinutes: sheet.totalMinutes,
      overtimeMinutes: this.deriveOvertimeMinutes(sheet.entries, sheet.overtimeMinutesOverride, timeZone),
      overtimeMinutesOverride: sheet.overtimeMinutesOverride,
      entries: sheet.entries.filter((e) => entryUpdates.some((u) => u.id === e.id)).map(toSnapshot),
    };

    const entriesAfter = sheet.entries.map((e) => {
      const update = entryUpdates.find((u) => u.id === e.id);
      return update ? { ...e, ...update } : e;
    });
    const after = {
      totalMinutes: totalMinutesAfter,
      overtimeMinutes: this.deriveOvertimeMinutes(entriesAfter, overtimeOverrideAfter, timeZone),
      overtimeMinutesOverride: overtimeOverrideAfter,
      entries: entriesAfter.filter((e) => entryUpdates.some((u) => u.id === e.id)).map(toSnapshot),
    };

    const results = await this.prisma.$transaction([
      ...entryUpdates.map((u) =>
        this.prisma.timeEntry.update({
          where: { id: u.id },
          data: {
            startTime: u.startTime,
            endTime: u.endTime,
            durationMinutes: u.durationMinutes,
            submittedMinutes: u.submittedMinutes,
            approvedMinutes: u.approvedMinutes,
            rejectedMinutes: u.rejectedMinutes,
            rejectionReason: u.rejectionReason,
            updatedBy: p.userId,
            version: { increment: 1 },
          },
        }),
      ),
      this.prisma.timesheet.update({
        where: { id: timesheetId },
        data: {
          totalMinutes: totalMinutesAfter,
          overtimeMinutesOverride: overtimeOverrideAfter,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: AuditAction.TIME_ADJUSTMENT,
          entityType: 'timesheet',
          entityId: timesheetId,
          metadata: {
            event: 'SUPERVISOR_TIME_ADJUSTMENT',
            reason,
            supervisorId: p.userId,
            employeeId: sheet.userId,
            before,
            after,
          } as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    const updated = results[entryUpdates.length] as Timesheet;

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: sheet.userId,
      senderId: p.userId,
      type: 'TIME_ADJUSTED',
      category: 'TIMESHEETS',
      title: 'Timesheet hours adjusted',
      message:
        `Your supervisor adjusted this period's hours to ${(after.totalMinutes / 60).toFixed(2)}h ` +
        `(${(after.overtimeMinutes / 60).toFixed(2)}h overtime). Reason: ${reason}`,
      priority: 'HIGH',
      actionUrl: '/timesheets',
      actionLabel: 'View Details',
    });

    return { ...updated, overtimeMinutes: after.overtimeMinutes, adjustment: { before, after, reason } };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Validates each requested entry change against the entry it targets and
   * resolves the final startTime/endTime/durationMinutes triple, along with
   * submitted/approved/rejected minutes deltas and rejection reasons.
   */
  private resolveEntryUpdates(
    entries: TimeEntry[],
    requested: AdjustEntryDto[],
  ): {
    id: string;
    startTime: Date;
    endTime: Date | null;
    durationMinutes: number | null;
    submittedMinutes: number | null;
    approvedMinutes: number | null;
    rejectedMinutes: number | null;
    rejectionReason: string | null;
  }[] {
    const byId = new Map(entries.map((e) => [e.id, e] as const));
    const seen = new Set<string>();

    return requested.map((r) => {
      const entry = byId.get(r.entryId);
      if (!entry) {
        throw new UnprocessableEntityException(
          `Entry ${r.entryId} is not part of this timesheet`,
        );
      }
      if (seen.has(r.entryId)) {
        throw new UnprocessableEntityException(`Entry ${r.entryId} was adjusted twice`);
      }
      seen.add(r.entryId);

      const startTime = r.startTime ? new Date(r.startTime) : entry.startTime;
      const endTime = r.endTime ? new Date(r.endTime) : entry.endTime;
      if (endTime && endTime <= startTime) {
        throw new UnprocessableEntityException('Time Out must be after Time In');
      }

      const calculatedSpan = endTime
        ? Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 60_000))
        : entry.durationMinutes;

      const submittedMinutes = entry.submittedMinutes ?? entry.durationMinutes ?? calculatedSpan ?? 0;

      let approvedMinutes = r.approvedMinutes;
      if (approvedMinutes === undefined) {
        approvedMinutes = r.durationMinutes !== undefined ? r.durationMinutes : (calculatedSpan ?? 0);
      }

      let rejectedMinutes = r.rejectedMinutes;
      if (rejectedMinutes === undefined) {
        rejectedMinutes = Math.max(0, submittedMinutes - approvedMinutes);
      }

      const rejectionReason = r.rejectionReason?.trim() || null;
      const durationMinutes = approvedMinutes;

      return {
        id: entry.id,
        startTime,
        endTime,
        durationMinutes,
        submittedMinutes,
        approvedMinutes,
        rejectedMinutes,
        rejectionReason,
      };
    });
  }

  /** Override when the supervisor set one, otherwise the usual >8h/day rollup. */
  private deriveOvertimeMinutes(
    entries: { startTime: Date; durationMinutes: number | null }[],
    override: number | null,
    timeZone: string,
  ): number {
    if (override !== null) return override;

    // Local days, not UTC — a shift starting before 08:00 local otherwise split
    // across two buckets and lost its overtime.
    const byDay = new Map<string, number>();
    for (const e of entries) {
      const key = orgDayKey(e.startTime, timeZone);
      byDay.set(key, (byDay.get(key) ?? 0) + (e.durationMinutes ?? 0));
    }
    let overtime = 0;
    for (const minutes of byDay.values()) {
      if (minutes > REGULAR_DAY_MINUTES) overtime += minutes - REGULAR_DAY_MINUTES;
    }
    return overtime;
  }

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  /**
   * Org-wide readers (Admin) may adjust anyone; a supervisor only their own
   * department's people — the same scope rule ApprovalsService applies before
   * letting them decide on the sheet (BR-APP-03).
   */
  private async assertCanAdjust(p: AuthPrincipal, sheet: { userId: string }): Promise<void> {
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)) return;
    if ((await this.deptScope.teamUserIds(p)).includes(sheet.userId)) return;
    throw new ForbiddenException('This timesheet is outside your team scope');
  }
}

function toSnapshot(e: {
  id: string;
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number | null;
  submittedMinutes?: number | null;
  approvedMinutes?: number | null;
  rejectedMinutes?: number | null;
  rejectionReason?: string | null;
}): EntrySnapshot {
  return {
    id: e.id,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime?.toISOString() ?? null,
    durationMinutes: e.durationMinutes,
    ...(e.submittedMinutes != null ? { submittedMinutes: e.submittedMinutes } : {}),
    ...(e.approvedMinutes != null ? { approvedMinutes: e.approvedMinutes } : {}),
    ...(e.rejectedMinutes != null ? { rejectedMinutes: e.rejectedMinutes } : {}),
    ...(e.rejectionReason != null ? { rejectionReason: e.rejectionReason } : {}),
  };
}
