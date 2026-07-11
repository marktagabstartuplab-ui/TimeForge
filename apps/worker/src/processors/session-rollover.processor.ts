import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { WorkSession } from '@prisma/client';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';

/** How often the sweep runs — a session can stay open at most this long past its local midnight. */
const SWEEP_INTERVAL_MS = 5 * 60_000;
const SWEEP_JOB_ID = 'session-rollover-sweep';

/**
 * Converts a local wall-clock time in `timeZone` to the equivalent UTC instant,
 * using only the native Intl API (no new date/timezone dependency). Accurate
 * except within the same second as a DST transition, which is an acceptable
 * edge case for a day-boundary sweep with a 5-minute cadence.
 */
function zonedTimeToUtc(y: number, m: number, d: number, timeZone: string): Date {
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(utcGuess))) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  const readAsUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour === 24 ? 0 : map.hour, map.minute, map.second);
  const offset = readAsUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** The UTC instant at which `workDate`'s local calendar day ends in `timeZone` — i.e. next local midnight. */
function endOfLocalDayUtc(workDate: Date, timeZone: string): Date {
  const next = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate() + 1));
  return zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
}

/**
 * Auto-closes work sessions left open across a day boundary. Without this, an
 * employee who forgets to clock out keeps accumulating minutes into the next
 * day, silently corrupting that day's timesheet/attendance/payroll aggregates
 * (which all derive from TimeEntry.durationMinutes) and blocking a fresh
 * clock-in the next morning (clockIn() rejects while an active session exists).
 *
 * Closes each session exactly at local midnight (not "now"), so no minutes
 * past the boundary are ever attributed to the old day.
 */
@Processor('session-rollover')
export class SessionRolloverProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SessionRolloverProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('session-rollover') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sweep',
      {},
      { jobId: SWEEP_JOB_ID, repeat: { every: SWEEP_INTERVAL_MS }, removeOnComplete: true, removeOnFail: true },
    );
  }

  async process(_job: Job): Promise<{ closed: number; checked: number }> {
    const activeSessions = await this.prisma.workSession.findMany({ where: { isActive: true } });
    if (activeSessions.length === 0) return { closed: 0, checked: 0 };

    const orgIds = [...new Set(activeSessions.map((s) => s.organizationId))];
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, timezone: true },
    });
    const tzByOrg = new Map(orgs.map((o) => [o.id, o.timezone || 'UTC']));

    const now = new Date();
    let closed = 0;
    for (const session of activeSessions) {
      const timezone = tzByOrg.get(session.organizationId) ?? 'UTC';
      const cutoff = endOfLocalDayUtc(session.workDate, timezone);
      if (now < cutoff) continue; // still the same local day — leave it running

      const didClose = await this.closeAtCutoff(session, cutoff);
      if (didClose) closed++;
    }

    if (closed > 0) this.logger.log(`Day-rollover sweep: auto-closed ${closed} of ${activeSessions.length} active session(s).`);
    return { closed, checked: activeSessions.length };
  }

  /** Mirrors WorkSessionsService.clockOut(), capped at `cutoff` instead of "now". */
  private async closeAtCutoff(session: WorkSession, cutoff: Date): Promise<boolean> {
    let breakMinutes = session.breakMinutes;
    if (session.currentBreakStartedAt) {
      breakMinutes += this.minutes(session.currentBreakStartedAt, cutoff);
    } else {
      const running = await this.prisma.timeEntry.findFirst({
        where: { workSessionId: session.id, endTime: null, deletedAt: null },
      });
      if (running) {
        await this.prisma.timeEntry.update({
          where: { id: running.id },
          data: {
            endTime: cutoff,
            durationMinutes: this.minutes(running.startTime, cutoff),
            updatedBy: session.userId,
            version: { increment: 1 },
          },
        });
      }
    }

    const entries = await this.prisma.timeEntry.findMany({ where: { workSessionId: session.id, deletedAt: null } });
    const sessionDurationMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

    // Guard against a race with a real clock-out that landed between our read and this write.
    const result = await this.prisma.workSession.updateMany({
      where: { id: session.id, isActive: true },
      data: {
        clockOut: cutoff,
        isActive: false,
        currentBreakStartedAt: null,
        breakMinutes,
        sessionDurationMinutes,
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
        metadata: { autoClosed: true, reason: 'day_rollover' },
        occurredAt: cutoff,
      },
    });
    return true;
  }

  private minutes(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  }
}
