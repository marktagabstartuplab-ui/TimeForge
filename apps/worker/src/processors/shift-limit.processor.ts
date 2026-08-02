import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { ShiftLimitsService } from '../../../api/src/modules/shift-limits/shift-limits.service';

/**
 * How often the sweep runs. This is the worst-case lateness of the force-close
 * *action* only — the recorded clock-out time is always the session's exact
 * deadline, so no extra minutes ever land on a timesheet regardless of cadence.
 */
const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_JOB_ID = 'shift-limit-sweep';

/**
 * Enforces the configured maximum shift duration (FEAT-2).
 *
 * Complements SessionRolloverProcessor, which closes sessions at local midnight:
 * this one closes them at `maxClockOutAt`, whichever comes first in practice.
 * Both are idempotent and race-guarded (`updateMany ... where isActive: true`),
 * so a session caught by both is still only closed once.
 */
@Processor('shift-limit')
export class ShiftLimitProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ShiftLimitProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftLimits: ShiftLimitsService,
    @InjectQueue('shift-limit') private readonly queue: Queue,
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

  async process(_job: Job): Promise<{ checked: number; warned: number; closed: number }> {
    // Only limit-enforced sessions matter; `maxClockOutAt: null` means unlimited.
    const sessions = await this.prisma.workSession.findMany({
      where: { isActive: true, maxClockOutAt: { not: null } },
    });
    if (sessions.length === 0) return { checked: 0, warned: 0, closed: 0 };

    const now = new Date();
    let warned = 0;
    let closed = 0;

    for (const session of sessions) {
      try {
        const status = await this.shiftLimits.evaluateAndNotify(session, now);
        if (status.state === 'WARNING' || status.state === 'LIMIT_REACHED') warned++;
        if (status.state === 'EXPIRED' && (await this.shiftLimits.autoClockOut(session))) closed++;
      } catch (err) {
        // One bad session must not abort the sweep for everyone else.
        this.logger.error(`Shift-limit check failed for session ${session.id}: ${(err as Error).message}`);
      }
    }

    if (closed > 0 || warned > 0) {
      this.logger.log(`Shift-limit sweep: ${sessions.length} checked, ${warned} at/near limit, ${closed} auto-closed.`);
    }
    return { checked: sessions.length, warned, closed };
  }
}
