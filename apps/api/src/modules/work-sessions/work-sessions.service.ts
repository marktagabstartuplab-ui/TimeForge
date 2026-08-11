import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, SessionEvent, ShiftConfiguration, WorkSession } from '@prisma/client';
import { orgDateOnly } from '@timeforge/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';
import { ClockInDto } from './dto';
import { ShiftLimitStatus, ShiftLimitsService } from '../shift-limits/shift-limits.service';

export interface WorkSessionSummary {
  session: WorkSession | null;
  onBreak: boolean;
  runningEntryId: string | null;
  /** Worked minutes for this session, excluding breaks — running segment counted up to now. */
  workedMinutes: number;
  /**
   * Shift-limit state for an *active* session, else null. Additive: existing
   * clients that ignore this field are unaffected.
   */
  shiftLimit: ShiftLimitStatus | null;
  /** BUG-BX — the whole day across every session, for the Time In gate. */
  dailyTotals: DailyTotals;
}

/**
 * BUG-BX — split shifts. A day is no longer one session: the cap that matters
 * is the *cumulative* worked time across all of today's sessions, which is what
 * decides whether Time In is offered again.
 */
export interface DailyTotals {
  /** Worked minutes across every session today, breaks excluded, running segment included. */
  workedMinutes: number;
  /** The organization's daily ceiling; null when no shift configuration applies. */
  maxDailyMinutes: number | null;
  /** Null when unlimited. Floors at 0 — never negative. */
  remainingMinutes: number | null;
  /** False when a new session would start already at or over the ceiling. */
  canClockIn: boolean;
  /** Why Time In is unavailable, for the button's tooltip. Null when it is available. */
  blockedReason: string | null;
}

/** BUG-BW — one organization-local day of immutable DTR events. */
export interface DailyLog {
  /** The requested day, echoed back as YYYY-MM-DD. */
  date: string;
  /** Chronological, oldest first. Empty when nothing was clocked that day. */
  events: SessionEvent[];
}

@Injectable()
export class WorkSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeZones: OrgTimeZoneService,
    private readonly shiftLimits: ShiftLimitsService,
  ) {}

  async current(p: AuthPrincipal): Promise<WorkSessionSummary> {
    let active = await this.prisma.workSession.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, isActive: true },
    });

    // Enforce the shift limit on read, so the UI reflects a breach immediately
    // rather than waiting up to 5 minutes for the worker sweep. Both paths call
    // the same idempotent service, so whichever runs first wins harmlessly.
    let shiftLimit: ShiftLimitStatus | null = null;
    if (active) {
      shiftLimit = await this.shiftLimits.evaluateAndNotify(active);
      if (shiftLimit.state === 'EXPIRED' && (await this.shiftLimits.autoClockOut(active))) {
        active = await this.prisma.workSession.findUnique({ where: { id: active.id } });
        shiftLimit = null;
      }
    }

    const today = await this.today(p);
    const dailyTotals = await this.dailyTotals(p, today, Boolean(active));

    const session =
      active ??
      (await this.prisma.workSession.findFirst({
        where: { tenantId: p.tenantId, userId: p.userId, workDate: today },
        orderBy: { clockIn: 'desc' },
      }));
    if (!session) {
      return {
        session: null,
        onBreak: false,
        runningEntryId: null,
        workedMinutes: 0,
        shiftLimit: null,
        dailyTotals,
      };
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: { workSessionId: session.id, deletedAt: null },
    });
    const running = entries.find((e) => !e.endTime) ?? null;
    const now = new Date();
    const workedMinutes = entries.reduce(
      (sum, e) => sum + (e.durationMinutes ?? this.minutes(e.startTime, now)),
      0,
    );

    return {
      session,
      onBreak: Boolean(session.currentBreakStartedAt),
      runningEntryId: running?.id ?? null,
      workedMinutes,
      shiftLimit: session.isActive ? shiftLimit : null,
      dailyTotals,
    };
  }

  async clockIn(p: AuthPrincipal, dto: ClockInDto): Promise<WorkSessionSummary> {
    const active = await this.prisma.workSession.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, isActive: true },
    });
    if (active) throw new ConflictException('You already have an active session');

    // BUG-BX \u2014 split shifts. Closing a session no longer closes the day: an
    // employee who works 1pm\u20136pm can come back at 8pm. What bounds the day is
    // the cumulative worked time, not the session count, so the ceiling is
    // checked here rather than inferred from "a session already ended".
    //
    // This also un-breaks two cases the old guard caught by accident: a
    // shift-limit auto-clock-out and the worker's midnight rollover both set
    // clockOut, and both used to lock the employee out for the rest of the day.
    const todayStart = await this.today(p);
    const totals = await this.dailyTotals(p, todayStart, false);
    if (!totals.canClockIn) {
      throw new ConflictException(totals.blockedReason ?? 'You cannot start another session today');
    }

    // Snapshot the shift configuration onto the session, so a later config change
    // cannot retroactively move the deadline of a shift already in progress.
    const clockIn = new Date();
    const config = await this.shiftLimits.defaultConfig(p.tenantId, p.organizationId);
    const priorSessions = await this.prisma.workSession.count({
      where: { tenantId: p.tenantId, userId: p.userId, workDate: todayStart },
    });
    const session = await this.prisma.workSession.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        workDate: todayStart,
        clockIn,
        shiftConfigurationId: config?.id ?? null,
        maxClockOutAt: this.sessionDeadline(clockIn, config, totals.remainingMinutes),
      },
    });
    await this.prisma.timeEntry.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        workSessionId: session.id,
        source: 'TIMER',
        startTime: new Date(),
        projectId: dto.projectId ?? null,
        clientId: dto.clientId ?? null,
        workCategoryId: dto.workCategoryId ?? null,
        description: dto.description ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.event(p, session.id, 'CLOCK_IN');
    await this.audit(p, AuditAction.ADMIN_ACTION, 'work_session', session.id, {
      event: 'CLOCK_IN',
      // Which session of the day this is — a split shift is otherwise
      // indistinguishable from a normal one in the audit trail.
      sessionOrdinal: priorSessions + 1,
    });

    // BUG-BX (4) — a second session gets to plan its own commitments. BUG-BP
    // freezes the plan on first save, which is right for one continuous day but
    // would leave an employee returning at 8pm unable to record what the evening
    // is for. Reopening is scoped to a genuinely new session, so a single-session
    // day keeps BUG-BP's lock exactly as it is.
    if (priorSessions > 0) {
      await this.reopenPlanForNewSession(p, todayStart);
    }
    return this.current(p);
  }

  async breakStart(p: AuthPrincipal): Promise<WorkSessionSummary> {
    const session = await this.activeSession(p);
    if (session.currentBreakStartedAt) throw new ConflictException('Already on break');

    const running = await this.prisma.timeEntry.findFirst({
      where: { workSessionId: session.id, endTime: null, deletedAt: null },
    });
    if (!running) throw new ConflictException('No active work segment to pause');

    const end = new Date();
    await this.prisma.timeEntry.update({
      where: { id: running.id },
      data: {
        endTime: end,
        durationMinutes: this.minutes(running.startTime, end),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.prisma.workSession.update({
      where: { id: session.id },
      data: { currentBreakStartedAt: end, breakCount: { increment: 1 }, version: { increment: 1 } },
    });
    await this.event(p, session.id, 'BREAK_START');
    await this.audit(p, AuditAction.ADMIN_ACTION, 'work_session', session.id, { event: 'BREAK_START' });
    return this.current(p);
  }

  async breakEnd(p: AuthPrincipal): Promise<WorkSessionSummary> {
    const session = await this.activeSession(p);
    if (!session.currentBreakStartedAt) throw new ConflictException('Not currently on break');

    const now = new Date();
    const elapsed = this.minutes(session.currentBreakStartedAt, now);
    const lastEntry = await this.prisma.timeEntry.findFirst({
      where: { workSessionId: session.id, deletedAt: null },
      orderBy: { startTime: 'desc' },
    });

    await this.prisma.workSession.update({
      where: { id: session.id },
      data: {
        breakMinutes: { increment: elapsed },
        currentBreakStartedAt: null,
        version: { increment: 1 },
      },
    });
    await this.prisma.timeEntry.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        workSessionId: session.id,
        source: 'TIMER',
        startTime: now,
        projectId: lastEntry?.projectId ?? null,
        clientId: lastEntry?.clientId ?? null,
        workCategoryId: lastEntry?.workCategoryId ?? null,
        description: lastEntry?.description ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.event(p, session.id, 'BREAK_END');
    await this.audit(p, AuditAction.ADMIN_ACTION, 'work_session', session.id, { event: 'BREAK_END' });
    return this.current(p);
  }

  async clockOut(p: AuthPrincipal): Promise<WorkSessionSummary> {
    const session = await this.activeSession(p);
    const now = new Date();

    let breakMinutes = session.breakMinutes;
    if (session.currentBreakStartedAt) {
      breakMinutes += this.minutes(session.currentBreakStartedAt, now);
    } else {
      const running = await this.prisma.timeEntry.findFirst({
        where: { workSessionId: session.id, endTime: null, deletedAt: null },
      });
      if (running) {
        await this.prisma.timeEntry.update({
          where: { id: running.id },
          data: {
            endTime: now,
            durationMinutes: this.minutes(running.startTime, now),
            updatedBy: p.userId,
            version: { increment: 1 },
          },
        });
      }
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: { workSessionId: session.id, deletedAt: null },
    });
    const sessionDurationMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

    await this.prisma.workSession.update({
      where: { id: session.id },
      data: {
        clockOut: now,
        isActive: false,
        currentBreakStartedAt: null,
        breakMinutes,
        sessionDurationMinutes,
        version: { increment: 1 },
      },
    });
    await this.event(p, session.id, 'CLOCK_OUT');
    await this.audit(p, AuditAction.ADMIN_ACTION, 'work_session', session.id, { event: 'CLOCK_OUT' });
    return this.current(p);
  }

  /**
   * BUG-BW — the caller's own DTR event history for one organization-local day:
   * every clock-in, break start/end and clock-out across every session filed
   * under that `workDate`, oldest first.
   *
   * Read-only by construction. `occurredAt` is written server-side (either
   * `now()` at the time of the action, or the exact deadline/cutoff for an
   * auto-close), and there is no endpoint that edits or deletes a SessionEvent —
   * which is the whole point of the log for attendance disputes.
   */
  async dailyLog(p: AuthPrincipal, date: string): Promise<DailyLog> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be an ISO calendar date (YYYY-MM-DD)');
    }
    const workDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(workDate.getTime())) {
      throw new BadRequestException('date must be a valid calendar date');
    }

    const sessions = await this.prisma.workSession.findMany({
      where: { tenantId: p.tenantId, userId: p.userId, workDate },
      select: { id: true },
    });
    if (sessions.length === 0) return { date, events: [] };

    const events = await this.prisma.sessionEvent.findMany({
      where: { tenantId: p.tenantId, userId: p.userId, workSessionId: { in: sessions.map((s) => s.id) } },
      orderBy: { occurredAt: 'asc' },
    });
    return { date, events };
  }

  async events(p: AuthPrincipal, sessionId: string): Promise<SessionEvent[]> {
    const session = await this.prisma.workSession.findFirst({
      where: { id: sessionId, tenantId: p.tenantId, organizationId: p.organizationId },
    });
    if (!session) throw new NotFoundException('Work session not found');
    if (session.userId !== p.userId) throw new ForbiddenException('You can only view your own session timeline');

    return this.prisma.sessionEvent.findMany({
      where: { workSessionId: sessionId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * BUG-BX — the day's worked minutes across *every* session, and what that
   * leaves. Breaks are excluded (it sums time entries, which are closed at
   * break start and reopened at break end), and a running segment counts up to
   * now, so the figure matches the timer the employee is watching.
   *
   * @param hasActiveSession suppresses `canClockIn` — a second concurrent
   *   session is refused regardless of how much of the day is left.
   */
  private async dailyTotals(
    p: AuthPrincipal,
    workDate: Date,
    hasActiveSession: boolean,
  ): Promise<DailyTotals> {
    const sessions = await this.prisma.workSession.findMany({
      where: { tenantId: p.tenantId, userId: p.userId, workDate },
      select: { id: true },
    });

    let workedMinutes = 0;
    if (sessions.length > 0) {
      const entries = await this.prisma.timeEntry.findMany({
        where: { workSessionId: { in: sessions.map((s) => s.id) }, deletedAt: null },
      });
      const now = new Date();
      workedMinutes = entries.reduce(
        (sum, e) => sum + (e.durationMinutes ?? this.minutes(e.startTime, now)),
        0,
      );
    }

    // The ceiling is the organization's daily cap. It falls back to the shift
    // length for a configuration that has never set one — which is how this
    // behaved when the two shared a single field, so nothing changes for an org
    // that hasn't opted in. No configuration at all means no ceiling, matching
    // how the shift-limit service already reports UNLIMITED.
    const config = await this.shiftLimits.defaultConfig(p.tenantId, p.organizationId);
    const maxDailyMinutes = config?.maxDailyMinutes ?? config?.maxShiftMinutes ?? null;
    const remainingMinutes =
      maxDailyMinutes === null ? null : Math.max(0, maxDailyMinutes - workedMinutes);

    const overCap = remainingMinutes !== null && remainingMinutes <= 0;
    return {
      workedMinutes,
      maxDailyMinutes,
      remainingMinutes,
      canClockIn: !hasActiveSession && !overCap,
      blockedReason: hasActiveSession
        ? 'You already have an active session'
        : overCap
          ? `You have reached your ${this.hoursLabel(maxDailyMinutes!)} daily limit. New sessions are available tomorrow.`
          : null,
    };
  }

  /**
   * BUG-BX (4) — clears the plan lock so the new session can log its own
   * commitments. Only the lock is lifted: existing commitments, blockers and
   * everything already reported stay exactly as they are, and a day that never
   * locked its plan is untouched.
   */
  private async reopenPlanForNewSession(p: AuthPrincipal, workDate: Date): Promise<void> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        entryDate: workDate,
        deletedAt: null,
      },
      select: { id: true, planLockedAt: true, isLocked: true },
    });
    // A fully-locked day (every commitment complete) stays locked — that is the
    // supervisor's gate (BUG-AE), not the plan lock, and it is not ours to lift.
    if (!entry || !entry.planLockedAt || entry.isLocked) return;

    await this.prisma.scrumEntry.update({
      where: { id: entry.id },
      data: { planLockedAt: null, updatedBy: p.userId },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'scrum_entry', entry.id, {
      event: 'PLAN_REOPENED_FOR_NEW_SESSION',
    });
  }

  /**
   * The hard deadline for a session starting now: the earlier of the shift cap
   * and what is left of the day.
   *
   * `deadlineFor` alone grants a fresh full shift on every clock-in, so an
   * employee with 30 minutes of daily allowance left could start a session and
   * run another `maxShiftMinutes` — the daily ceiling was checked at clock-in
   * and never again. Bounding the deadline hands the whole existing enforcement
   * chain (warning, REACHED_LIMIT, the sweep's auto-clock-out) the right time
   * without duplicating any of it, since all of them read `maxClockOutAt`.
   *
   * The two limits measure different things: the shift cap is elapsed wall
   * clock, the daily allowance is net worked minutes. Taking a break in the
   * final session therefore reaches this deadline with a few worked minutes to
   * spare. Closing slightly early is the safe side of a cap, and a supervisor
   * override still moves the deadline as before.
   */
  private sessionDeadline(
    clockIn: Date,
    config: ShiftConfiguration | null,
    remainingDailyMinutes: number | null,
  ): Date | null {
    const shiftDeadline = config ? this.shiftLimits.deadlineFor(clockIn, config) : null;
    const dailyDeadline =
      remainingDailyMinutes === null
        ? null
        : new Date(clockIn.getTime() + remainingDailyMinutes * 60_000);
    if (!shiftDeadline) return dailyDeadline;
    if (!dailyDeadline) return shiftDeadline;
    return shiftDeadline <= dailyDeadline ? shiftDeadline : dailyDeadline;
  }

  /** "12-hour" / "7.5-hour" — for limit messages. */
  private hoursLabel(minutes: number): string {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
  }

  private async audit(p: AuthPrincipal, action: AuditAction, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { tenantId: p.tenantId, actorId: p.userId, action, entityType, entityId, metadata } });
  }

  private async activeSession(p: AuthPrincipal): Promise<WorkSession> {
    const session = await this.prisma.workSession.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, isActive: true },
    });
    if (!session) throw new NotFoundException('No active work session');
    return session;
  }

  private async event(
    p: AuthPrincipal,
    workSessionId: string,
    eventType: SessionEvent['eventType'],
  ): Promise<void> {
    await this.prisma.sessionEvent.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        workSessionId,
        eventType,
      },
    });
  }

  private minutes(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  }

  /**
   * The `workDate` (a date-only column) for right now, as the organization's
   * local calendar day. A UTC-derived date filed a 7am Manila clock-in under
   * the previous day, which also disagreed with the worker's rollover sweep —
   * that closes sessions at *local* midnight.
   */
  private async today(p: AuthPrincipal): Promise<Date> {
    return orgDateOnly(new Date(), await this.timeZones.forPrincipal(p));
  }
}
