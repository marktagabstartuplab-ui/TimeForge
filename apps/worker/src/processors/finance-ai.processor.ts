import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { NotificationsService } from '../../../api/src/modules/notifications/notifications.service';
import { createHash } from 'node:crypto';

export interface FinanceAiJobData {
  jobId: string;
  tenantId: string;
  organizationId: string;
  actorId: string;
  reportData: {
    generatedAt: string;
    summary: Record<string, unknown>;
    alerts: unknown[];
    alertSummary: { total: number; critical: number };
  };
}

@Processor('finance-ai')
export class FinanceAiProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceAiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<FinanceAiJobData>): Promise<void> {
    const { jobId, tenantId, organizationId, actorId, reportData } = job.data;
    const startedAt = Date.now();

    this.logger.log(`Finance-AI job ${jobId} START attempt=${job.attemptsMade}`);

    try {
      // ── 1. Idempotency guard — skip if already SUCCEEDED ───────────────
      const current = await (this.prisma as any).aiJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (!current) {
        this.logger.warn(`Finance-AI job ${jobId} not found in DB — skipping`);
        return;
      }
      if (current.status === 'SUCCEEDED') {
        this.logger.log(`Finance-AI job ${jobId} already SUCCEEDED — skipping`);
        return;
      }

      // ── 2. Partial-completion recovery — result exists but status is stale ──
      const existingResult = await (this.prisma as any).aiResult.findUnique({
        where: { aiJobId: jobId },
      });
      if (existingResult) {
        this.logger.log(`Finance-AI job ${jobId} has result but status=${current.status} — recovering`);
        await (this.prisma as any).aiJob.update({
          where: { id: jobId },
          data: { status: 'SUCCEEDED', updatedBy: actorId, version: { increment: 1 } },
        });
        return;
      }

      // ── 3. Claim the job ────────────────────────────────────────────────
      await (this.prisma as any).aiJob.updateMany({
        where: { id: jobId, status: { in: ['QUEUED', 'FAILED'] } },
        data: { status: 'RUNNING', updatedBy: actorId, version: { increment: 1 } },
      });

      // ── 4. Prepare results ──────────────────────────────────────────────
      const summaryText = JSON.stringify(reportData.summary);
      const alertsText = JSON.stringify(reportData.alerts);
      const promptHash = createHash('sha256').update(`finance-ai-report-${jobId}`).digest('hex');
      const responseHash = createHash('sha256').update(summaryText + alertsText).digest('hex');
      const recommendation = `${reportData.alertSummary.total} alerts found (${reportData.alertSummary.critical} critical).`;

      // ── 5. Persist result + audit + status atomically ─────────────────────
      await (this.prisma as any).$transaction(async (tx: any) => {
        const alreadyDone = await tx.aiResult.findUnique({
          where: { aiJobId: jobId },
        });
        if (alreadyDone) {
          this.logger.log(`Finance-AI job ${jobId} result persisted by another retry — recovering`);
          await tx.aiJob.update({
            where: { id: jobId },
            data: { status: 'SUCCEEDED', updatedBy: actorId, version: { increment: 1 } },
          });
          return;
        }

        await tx.aiResult.create({
          data: {
            tenantId,
            aiJobId: jobId,
            summary: summaryText,
            recommendation,
            confidence: 0.85,
            createdBy: actorId,
          },
        });

        await tx.aiAudit.create({
          data: {
            tenantId,
            aiJobId: jobId,
            promptHash,
            responseHash,
            executionTimeMs: Date.now() - startedAt,
            createdBy: actorId,
          },
        });

        await tx.aiJob.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            latencyMs: Date.now() - startedAt,
            updatedBy: actorId,
            version: { increment: 1 },
          },
        });
      });

      // ── 6. Notify finance users (after successful atomic persist) ────────
      this.logger.log(`Finance-AI job ${jobId} SUCCEEDED — sending notifications`);
      await this.sendNotifications(tenantId, organizationId, reportData);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Finance-AI job ${jobId} FAILED: ${msg}`);

      await (this.prisma as any).aiJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMsg: msg.slice(0, 500),
          latencyMs: Date.now() - startedAt,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      }).catch(() => { /* swallow — already failed */ });

      throw err;
    }
  }

  private async sendNotifications(
    tenantId: string,
    organizationId: string,
    reportData: FinanceAiJobData['reportData'],
  ): Promise<void> {
    try {
      const financeUsers = await (this.prisma as any).user.findMany({
        where: {
          tenantId,
          organizationId,
          roles: { some: { role: { key: 'FINANCE' } } },
          deletedAt: null,
        },
        select: { id: true },
      });

      await Promise.all(
        financeUsers.map((u: { id: string }) =>
          this.notifications.create({
            tenantId,
            organizationId,
            userId: u.id,
            type: 'ANNOUNCEMENT',
            category: 'PAYROLL',
            title: 'AI Financial Report Ready',
            message: `AI analysis complete: ${reportData.alertSummary.total} alerts found (${reportData.alertSummary.critical} critical).`,
            actionUrl: '/finance/ai-insights',
            actionLabel: 'View Report',
          }),
        ),
      );
    } catch (err) {
      this.logger.error(`Notification fan-out failed for job: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
