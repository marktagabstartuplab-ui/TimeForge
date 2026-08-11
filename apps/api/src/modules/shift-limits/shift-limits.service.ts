import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  ShiftConfiguration,
  ShiftLimitViolation,
  WorkSession,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { DecideOverrideDto, RequestOverrideDto, UpdateShiftConfigDto, ViolationQueryDto } from './dto';

/** Where a running session sits relative to its configured limit. */
export type ShiftLimitState =
  /** No configuration, or the session predates the feature — never enforced. */
  | 'UNLIMITED'
  /** Comfortably inside the limit. */
  | 'OK'
  /** Inside `warningLeadMinutes` of the limit (default: the last hour). */
  | 'WARNING'
  /** Past the limit, still inside the grace period — force-close is imminent. */
  | 'LIMIT_REACHED'
  /** Past limit + grace. The sweep will close (or has closed) this session. */
  | 'EXPIRED';

export interface ShiftLimitStatus {
  state: ShiftLimitState;
  /** Minutes elapsed since clock-in (wall clock, breaks included). */
  elapsedMinutes: number;
  /**
   * The cap in force for THIS session, in minutes — `maxClockOutAt - clockIn`,
   * so an approved override is reflected here. Not the org default. Null when
   * unlimited.
   */
  maxShiftMinutes: number | null;
  /** Minutes remaining until the hard cap; negative once past it. Null when unlimited. */
  remainingMinutes: number | null;
  /** The hard deadline, reflecting any approved extension. */
  maxClockOutAt: Date | null;
  /** A pending (NO_ACTION) MANUAL_OVERRIDE request for this session, if any. */
  pendingOverrideId: string | null;
  requiresSupervisorOverride: boolean;
}

/**
 * The shift limit is measured as **elapsed wall-clock time since clock-in**,
 * breaks included — not as net worked minutes. A 12-hour cap on presence is
 * what the policy is about; netting out breaks would let a session with two
 * hours of breaks run for 14 hours.
 */
@Injectable()
export class ShiftLimitsService {
  private readonly logger = new Logger(ShiftLimitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Configuration ───────────────────────────────────────────────────────────

  /** The org's active default configuration, or null when the org has none. */
  async defaultConfig(tenantId: string, organizationId: string): Promise<ShiftConfiguration | null> {
    return this.prisma.shiftConfiguration.findFirst({
      where: { tenantId, organizationId, isDefault: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getConfig(p: AuthPrincipal): Promise<ShiftConfiguration | null> {
    return this.defaultConfig(p.tenantId, p.organizationId);
  }

  async updateConfig(p: AuthPrincipal, dto: UpdateShiftConfigDto): Promise<ShiftConfiguration> {
    const existing = await this.defaultConfig(p.tenantId, p.organizationId);

    const maxShiftMinutes = dto.maxShiftMinutes ?? existing?.maxShiftMinutes ?? 720;
    const warningLeadMinutes = dto.warningLeadMinutes ?? existing?.warningLeadMinutes ?? 60;
    if (warningLeadMinutes >= maxShiftMinutes) {
      throw new BadRequestException('warningLeadMinutes must be less than maxShiftMinutes');
    }

    // Three-way, because two different "nothing" values mean different things.
    // `??` would treat an explicit null as "not supplied", and null is how a
    // caller clears the daily cap to restore the maxShiftMinutes fallback. And
    // when no value is supplied while *creating* a row, the key is left off
    // entirely rather than written as null: writing null would defeat the
    // column's 480 default and hand that org a silent 12-hour day. A daily cap
    // below the shift length is the point of the setting, not a mistake, so it
    // is not rejected.
    const maxDailyMinutes =
      dto.maxDailyMinutes !== undefined
        ? dto.maxDailyMinutes
        : existing
          ? existing.maxDailyMinutes
          : undefined;

    const data = {
      shiftName: dto.shiftName ?? existing?.shiftName ?? 'Standard',
      maxShiftMinutes,
      ...(maxDailyMinutes !== undefined ? { maxDailyMinutes } : {}),
      warningLeadMinutes,
      gracePeriodMinutes: dto.gracePeriodMinutes ?? existing?.gracePeriodMinutes ?? 0,
      requiresSupervisorOverride:
        dto.requiresSupervisorOverride ?? existing?.requiresSupervisorOverride ?? true,
      updatedBy: p.userId,
    };

    const config = existing
      ? await this.prisma.shiftConfiguration.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.shiftConfiguration.create({
          data: {
            ...data,
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            isDefault: true,
            createdBy: p.userId,
          },
        });

    await this.audit(p, 'shift_configuration', config.id, {
      event: 'SHIFT_CONFIG_UPDATED',
      maxShiftMinutes: config.maxShiftMinutes,
      maxDailyMinutes: config.maxDailyMinutes,
      gracePeriodMinutes: config.gracePeriodMinutes,
      warningLeadMinutes: config.warningLeadMinutes,
      requiresSupervisorOverride: config.requiresSupervisorOverride,
    });
    return config;
  }

  // ── Evaluation ──────────────────────────────────────────────────────────────

  /** The hard deadline for a session clocked in at `clockIn` under `config`. */
  deadlineFor(clockIn: Date, config: ShiftConfiguration): Date {
    return new Date(clockIn.getTime() + config.maxShiftMinutes * 60_000);
  }

  /**
   * Classifies a session against its snapshotted configuration. Pure apart from
   * the pending-override lookup, so the worker sweep and the `/current` endpoint
   * agree on state without duplicating thresholds.
   */
  async status(session: WorkSession, now: Date = new Date()): Promise<ShiftLimitStatus> {
    const elapsedMinutes = this.minutes(session.clockIn, now);
    const config = session.shiftConfigurationId
      ? await this.prisma.shiftConfiguration.findUnique({ where: { id: session.shiftConfigurationId } })
      : null;

    if (!config || !session.maxClockOutAt) {
      return {
        state: 'UNLIMITED',
        elapsedMinutes,
        maxShiftMinutes: null,
        remainingMinutes: null,
        maxClockOutAt: null,
        pendingOverrideId: null,
        requiresSupervisorOverride: false,
      };
    }

    const deadline = session.maxClockOutAt;
    const remainingMinutes = Math.round((deadline.getTime() - now.getTime()) / 60_000);
    const graceEnd = new Date(deadline.getTime() + config.gracePeriodMinutes * 60_000);

    let state: ShiftLimitState;
    if (now >= graceEnd) state = 'EXPIRED';
    else if (now >= deadline) state = 'LIMIT_REACHED';
    else if (remainingMinutes <= config.warningLeadMinutes) state = 'WARNING';
    else state = 'OK';

    const pending = await this.prisma.shiftLimitViolation.findFirst({
      where: {
        workSessionId: session.id,
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'NO_ACTION',
      },
      orderBy: { violationAt: 'desc' },
    });

    // The limit *for this session*, derived from its (possibly extended) deadline
    // rather than the org default. Reporting the config value made an extended
    // shift contradict itself in the UI — "SHIFT LIMIT — 12H … 42M LEFT" shown
    // against 12h18m elapsed — and recorded the wrong minutes on the
    // REACHED_LIMIT row for any deadline an override had moved.
    const effectiveLimitMinutes = Math.round((deadline.getTime() - session.clockIn.getTime()) / 60_000);

    return {
      state,
      elapsedMinutes,
      maxShiftMinutes: effectiveLimitMinutes,
      remainingMinutes,
      maxClockOutAt: deadline,
      pendingOverrideId: pending?.id ?? null,
      requiresSupervisorOverride: config.requiresSupervisorOverride,
    };
  }

  // ── Enforcement (called from the API on read, and from the worker sweep) ─────

  /**
   * Records the one-time REACHED_LIMIT violation and warns the employee once
   * they enter the warning window. Idempotent: each side-effect is guarded by a
   * marker row / flag, so the 5-minute sweep and every `/current` poll can call
   * this freely without spamming notifications.
   */
  async evaluateAndNotify(session: WorkSession, now: Date = new Date()): Promise<ShiftLimitStatus> {
    const status = await this.status(session, now);
    if (status.state === 'UNLIMITED' || status.state === 'OK') return status;

    if (status.state === 'WARNING') {
      await this.notifyOnce(session, 'SHIFT_LIMIT_WARNING', {
        title: 'Approaching your shift limit',
        message: `You have been clocked in for ${this.hours(status.elapsedMinutes)}. Your ${this.hours(
          status.maxShiftMinutes!,
        )} limit is reached in ${Math.max(0, status.remainingMinutes ?? 0)} minute(s).`,
        deadline: status.maxClockOutAt,
      });
      return status;
    }

    // LIMIT_REACHED or EXPIRED — record the crossing exactly once *per deadline*.
    // Keying on the session alone would swallow the second crossing after a
    // supervisor extends the shift: the employee would get no further warning
    // and the extended limit would never appear in the audit trail.
    const already = await this.prisma.shiftLimitViolation.findFirst({
      where: {
        workSessionId: session.id,
        violationType: 'REACHED_LIMIT',
        violationAt: status.maxClockOutAt ?? undefined,
      },
    });
    if (!already) {
      await this.prisma.shiftLimitViolation.create({
        data: {
          tenantId: session.tenantId,
          organizationId: session.organizationId,
          workSessionId: session.id,
          employeeId: session.userId,
          shiftConfigurationId: session.shiftConfigurationId,
          violationType: 'REACHED_LIMIT',
          violationAt: status.maxClockOutAt ?? now,
          minutesWorkedAtViolation: status.maxShiftMinutes ?? status.elapsedMinutes,
        },
      });
      if (status.requiresSupervisorOverride && !session.requiresOverride) {
        await this.prisma.workSession.updateMany({
          where: { id: session.id, isActive: true },
          data: { requiresOverride: true, version: { increment: 1 } },
        });
      }
      await this.notifyOnce(session, 'SHIFT_LIMIT_WARNING', {
        title: 'Shift limit reached',
        message: `You have reached your ${this.hours(status.maxShiftMinutes!)} shift limit. ${
          status.requiresSupervisorOverride
            ? 'Request a supervisor override to continue, or clock out.'
            : 'Please clock out.'
        }`,
        deadline: status.maxClockOutAt,
        force: true,
      });
    }

    return status;
  }

  /**
   * Force-closes a session at its deadline. Mirrors `WorkSessionsService.clockOut()`
   * but caps every duration at `deadline` rather than "now", so not a single
   * minute past the limit reaches a timesheet. Returns false if the session was
   * closed by someone else in the meantime.
   */
  async autoClockOut(session: WorkSession, reason = '12-hour limit reached'): Promise<boolean> {
    const deadline = session.maxClockOutAt;
    if (!deadline) return false;

    let breakMinutes = session.breakMinutes;
    if (session.currentBreakStartedAt) {
      breakMinutes += this.minutes(session.currentBreakStartedAt, deadline);
    } else {
      const running = await this.prisma.timeEntry.findFirst({
        where: { workSessionId: session.id, endTime: null, deletedAt: null },
      });
      if (running) {
        await this.prisma.timeEntry.update({
          where: { id: running.id },
          data: {
            endTime: deadline,
            durationMinutes: this.minutes(running.startTime, deadline),
            updatedBy: session.userId,
            version: { increment: 1 },
          },
        });
      }
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: { workSessionId: session.id, deletedAt: null },
    });
    const sessionDurationMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

    // Guard against a race with a real clock-out between our read and this write.
    const result = await this.prisma.workSession.updateMany({
      where: { id: session.id, isActive: true },
      data: {
        clockOut: deadline,
        isActive: false,
        currentBreakStartedAt: null,
        breakMinutes,
        sessionDurationMinutes,
        isAutoClockedOut: true,
        autoClockOutReason: reason,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) return false;

    await this.prisma.sessionEvent.create({
      data: {
        tenantId: session.tenantId,
        organizationId: session.organizationId,
        userId: session.userId,
        workSessionId: session.id,
        eventType: 'CLOCK_OUT',
        metadata: { autoClosed: true, reason: 'shift_limit' },
        occurredAt: deadline,
      },
    });
    await this.prisma.shiftLimitViolation.create({
      data: {
        tenantId: session.tenantId,
        organizationId: session.organizationId,
        workSessionId: session.id,
        employeeId: session.userId,
        shiftConfigurationId: session.shiftConfigurationId,
        violationType: 'AUTO_CLOCKED_OUT',
        violationAt: deadline,
        minutesWorkedAtViolation: this.minutes(session.clockIn, deadline),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorId: session.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'work_session',
        entityId: session.id,
        metadata: { event: 'AUTO_CLOCK_OUT', reason, clockOutAt: deadline.toISOString() },
      },
    });

    await this.notify(session.tenantId, session.organizationId, session.userId, {
      type: 'SHIFT_AUTO_CLOCKED_OUT',
      title: 'You were automatically clocked out',
      message: `Your session was closed at your ${reason}. Contact your supervisor if this needs adjusting.`,
    });
    const supervisorId = await this.supervisorOf(session.userId);
    if (supervisorId) {
      await this.notify(session.tenantId, session.organizationId, supervisorId, {
        type: 'SHIFT_AUTO_CLOCKED_OUT',
        title: 'Employee auto-clocked out',
        message: `A team member hit the shift limit and was automatically clocked out (${reason}).`,
        actionUrl: '/supervisor/shift-overrides',
        actionLabel: 'Review',
      });
    }
    return true;
  }

  // ── Override workflow ───────────────────────────────────────────────────────

  async requestOverride(p: AuthPrincipal, dto: RequestOverrideDto): Promise<ShiftLimitViolation> {
    const session = await this.prisma.workSession.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, isActive: true },
    });
    if (!session) throw new NotFoundException('No active work session');
    if (!session.shiftConfigurationId || !session.maxClockOutAt) {
      throw new ConflictException('This session has no shift limit to extend');
    }

    const pending = await this.prisma.shiftLimitViolation.findFirst({
      where: {
        workSessionId: session.id,
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'NO_ACTION',
      },
    });
    if (pending) throw new ConflictException('An override request is already awaiting a decision');

    const supervisorId = await this.supervisorOf(p.userId);
    if (!supervisorId) {
      throw new ConflictException('You have no assigned supervisor to approve an override');
    }

    const violation = await this.prisma.shiftLimitViolation.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        workSessionId: session.id,
        employeeId: p.userId,
        shiftConfigurationId: session.shiftConfigurationId,
        violationType: 'MANUAL_OVERRIDE',
        minutesWorkedAtViolation: this.minutes(session.clockIn, new Date()),
        requestedExtensionMinutes: dto.additionalMinutes,
        supervisorNote: dto.reason ?? null,
      },
    });

    await this.notify(p.tenantId, p.organizationId, supervisorId, {
      type: 'SHIFT_OVERRIDE_REQUESTED',
      title: 'Shift extension requested',
      message: `An employee requests ${this.hours(dto.additionalMinutes)} beyond their shift limit.${
        dto.reason ? ` Reason: ${dto.reason}` : ''
      }`,
      actionUrl: '/supervisor/shift-overrides',
      actionLabel: 'Review request',
      senderId: p.userId,
      priority: 'HIGH',
    });
    await this.audit(p, 'shift_limit_violation', violation.id, {
      event: 'OVERRIDE_REQUESTED',
      additionalMinutes: dto.additionalMinutes,
    });
    return violation;
  }

  async decideOverride(
    p: AuthPrincipal,
    violationId: string,
    dto: DecideOverrideDto,
  ): Promise<ShiftLimitViolation> {
    const violation = await this.prisma.shiftLimitViolation.findFirst({
      where: { id: violationId, tenantId: p.tenantId, organizationId: p.organizationId },
    });
    if (!violation) throw new NotFoundException('Override request not found');
    if (violation.violationType !== 'MANUAL_OVERRIDE') {
      throw new BadRequestException('This violation is not an override request');
    }
    if (violation.supervisorAction !== 'NO_ACTION') {
      throw new ConflictException('This request has already been decided');
    }
    if (!(await this.supervises(p, violation.employeeId))) {
      throw new ForbiddenException('You can only decide requests from your own team');
    }

    const now = new Date();
    const approved = dto.approved;
    // A supervisor may grant less than was asked for.
    const grantedMinutes = approved
      ? dto.additionalMinutes ?? violation.requestedExtensionMinutes ?? 0
      : 0;

    const updated = await this.prisma.shiftLimitViolation.update({
      where: { id: violation.id },
      data: {
        supervisorAction: approved ? 'APPROVED' : 'DENIED',
        supervisorId: p.userId,
        supervisorActionAt: now,
        supervisorNote: dto.note ?? violation.supervisorNote,
        requestedExtensionMinutes: approved ? grantedMinutes : violation.requestedExtensionMinutes,
        version: { increment: 1 },
      },
    });

    if (approved && grantedMinutes > 0) {
      // Push the deadline out from the *existing* deadline, not from now, so an
      // approval that lands late does not silently shorten the extension.
      const session = await this.prisma.workSession.findUnique({ where: { id: violation.workSessionId } });
      if (session?.maxClockOutAt && session.isActive) {
        await this.prisma.workSession.update({
          where: { id: session.id },
          data: {
            maxClockOutAt: new Date(session.maxClockOutAt.getTime() + grantedMinutes * 60_000),
            requiresOverride: false,
            supervisorOverrideId: p.userId,
            overrideApproved: true,
            overrideApprovedAt: now,
            version: { increment: 1 },
          },
        });
      }
    } else if (!approved) {
      await this.prisma.workSession.updateMany({
        where: { id: violation.workSessionId, isActive: true },
        data: {
          supervisorOverrideId: p.userId,
          overrideApproved: false,
          overrideApprovedAt: now,
          version: { increment: 1 },
        },
      });
    }

    await this.notify(p.tenantId, p.organizationId, violation.employeeId, {
      type: 'SHIFT_OVERRIDE_DECISION',
      title: approved ? 'Shift extension approved' : 'Shift extension denied',
      message: approved
        ? `Your supervisor extended your shift by ${this.hours(grantedMinutes)}.`
        : `Your supervisor denied the extension. Please clock out.${dto.note ? ` Note: ${dto.note}` : ''}`,
      senderId: p.userId,
      priority: 'HIGH',
    });
    await this.audit(p, 'shift_limit_violation', violation.id, {
      event: approved ? 'OVERRIDE_APPROVED' : 'OVERRIDE_DENIED',
      grantedMinutes,
    });
    return updated;
  }

  // ── Violation reads ─────────────────────────────────────────────────────────

  async listViolations(p: AuthPrincipal, query: ViolationQueryDto) {
    const where: Prisma.ShiftLimitViolationWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
    };
    if (query.violationType) where.violationType = query.violationType;
    if (query.supervisorAction) where.supervisorAction = query.supervisorAction;

    const canReadOrg =
      p.permissions.includes('*') || p.permissions.includes('shift_violation:read_org');
    if (!canReadOrg) {
      if (!p.permissions.includes('shift_violation:read_team')) {
        throw new ForbiddenException('Missing required permission: shift_violation:read_team');
      }
      const reports = await this.prisma.user.findMany({
        where: { tenantId: p.tenantId, supervisorId: p.userId, deletedAt: null },
        select: { id: true },
      });
      where.employeeId = { in: reports.map((r) => r.id) };
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 100);
    const [data, total] = await Promise.all([
      this.prisma.shiftLimitViolation.findMany({
        where,
        orderBy: { violationAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, email: true } },
          workSession: { select: { id: true, clockIn: true, clockOut: true, maxClockOutAt: true, isActive: true } },
        },
      }),
      this.prisma.shiftLimitViolation.count({ where }),
    ]);
    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async supervisorOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { supervisorId: true },
    });
    return user?.supervisorId ?? null;
  }

  private async supervises(p: AuthPrincipal, employeeId: string): Promise<boolean> {
    if (p.permissions.includes('*') || p.permissions.includes('shift_violation:read_org')) return true;
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, tenantId: p.tenantId, supervisorId: p.userId },
      select: { id: true },
    });
    return Boolean(employee);
  }

  /**
   * Sends `type` at most once per session *per deadline*, keyed on notification
   * metadata. Including the deadline in the marker means an approved extension
   * re-arms the warning for the new window instead of silencing it.
   */
  private async notifyOnce(
    session: WorkSession,
    type: 'SHIFT_LIMIT_WARNING',
    opts: { title: string; message: string; deadline: Date | null; force?: boolean },
  ): Promise<void> {
    const stage = opts.force ? 'LIMIT' : 'WARN';
    const marker = `${type}:${stage}:${opts.deadline?.toISOString() ?? 'none'}`;
    // Both JSON predicates go in AND — a top-level `metadata` key alongside a
    // nested one is two filters on the same field and reads as ambiguous.
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId: session.tenantId,
        userId: session.userId,
        type,
        AND: [
          { metadata: { path: ['marker'], equals: marker } },
          { metadata: { path: ['workSessionId'], equals: session.id } },
        ],
      },
    });
    if (existing) return;

    await this.notify(session.tenantId, session.organizationId, session.userId, {
      type,
      title: opts.title,
      message: opts.message,
      priority: 'HIGH',
      metadata: { marker, workSessionId: session.id },
    });
  }

  private async notify(
    tenantId: string,
    organizationId: string,
    userId: string,
    opts: {
      type: 'SHIFT_LIMIT_WARNING' | 'SHIFT_AUTO_CLOCKED_OUT' | 'SHIFT_OVERRIDE_REQUESTED' | 'SHIFT_OVERRIDE_DECISION';
      title: string;
      message: string;
      actionUrl?: string;
      actionLabel?: string;
      senderId?: string;
      priority?: 'LOW' | 'NORMAL' | 'HIGH';
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.notifications.create({
        tenantId,
        organizationId,
        userId,
        type: opts.type,
        category: 'SCHEDULE',
        title: opts.title,
        message: opts.message,
        priority: opts.priority ?? 'NORMAL',
        actionUrl: opts.actionUrl ?? null,
        actionLabel: opts.actionLabel ?? null,
        senderId: opts.senderId ?? null,
        metadata: opts.metadata ?? {},
      });
    } catch (err) {
      // A failed notification must never abort enforcement — the clock-out and
      // the audit row matter more than the message.
      this.logger.error(`Failed to send ${opts.type} to user ${userId}: ${(err as Error).message}`);
    }
  }

  private async audit(
    p: AuthPrincipal,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType,
        entityId,
        metadata,
      },
    });
  }

  private minutes(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  }

  private hours(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} minute(s)`;
    return m === 0 ? `${h} hour(s)` : `${h}h ${m}m`;
  }
}
