import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, SessionEvent, WorkSession } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { ClockInDto } from './dto';

export interface WorkSessionSummary {
  session: WorkSession | null;
  onBreak: boolean;
  runningEntryId: string | null;
  /** Worked minutes for this session, excluding breaks — running segment counted up to now. */
  workedMinutes: number;
}

@Injectable()
export class WorkSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async current(p: AuthPrincipal): Promise<WorkSessionSummary> {
    const active = await this.prisma.workSession.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, isActive: true },
    });
    const session =
      active ??
      (await this.prisma.workSession.findFirst({
        where: { tenantId: p.tenantId, userId: p.userId, workDate: this.today() },
        orderBy: { clockIn: 'desc' },
      }));
    if (!session) return { session: null, onBreak: false, runningEntryId: null, workedMinutes: 0 };

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
    };
  }

  async clockIn(p: AuthPrincipal, dto: ClockInDto): Promise<WorkSessionSummary> {
    const active = await this.prisma.workSession.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, isActive: true },
    });
    if (active) throw new ConflictException('You already have an active session');

    // Block re-clock-in if today's session was already completed via EOD
    // (clockOut set + isActive false). New sessions are only allowed the
    // next calendar day (after midnight). This prevents employees from
    // starting a second session after submitting their End of Day Review.
    const todayStart = this.today();
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
    const todayCompletedSession = await this.prisma.workSession.findFirst({
      where: {
        tenantId: p.tenantId,
        userId: p.userId,
        workDate: { gte: todayStart, lt: todayEnd },
        clockOut: { not: null },
        isActive: false,
      },
    });
    if (todayCompletedSession) {
      throw new ConflictException(
        "Today\u2019s work session is complete. New sessions are available from tomorrow.",
      );
    }

    const session = await this.prisma.workSession.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        workDate: this.today(),
        clockIn: new Date(),
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
    await this.audit(p, AuditAction.ADMIN_ACTION, 'work_session', session.id, { event: 'CLOCK_IN' });
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

  private today(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
