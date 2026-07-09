import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FinanceAiJobData>): Promise<void> {
    const { jobId, tenantId, organizationId, actorId, reportData } = job.data;
    const startedAt = Date.now();

    this.logger.log(`Finance-AI job ${jobId} START`);

    try {
      const summaryText = JSON.stringify(reportData.summary);
      const alertsText = JSON.stringify(reportData.alerts);
      const promptHash = createHash('sha256').update(`finance-ai-report-${jobId}`).digest('hex');
      const responseHash = createHash('sha256').update(summaryText + alertsText).digest('hex');

      await (this.prisma as any).aiJob.upsert({
        where: { id: jobId },
        update: { status: 'RUNNING', updatedBy: actorId, version: { increment: 1 } },
        create: {
          id: jobId,
          tenantId,
          feature: 'FINANCE_REPORT',
          status: 'RUNNING',
          subjectId: organizationId,
          subjectType: 'organization',
          createdBy: actorId,
        },
      });

      await (this.prisma as any).aiResult.create({
        data: {
          tenantId,
          aiJobId: jobId,
          summary: summaryText,
          recommendation: `${reportData.alertSummary.total} alerts found (${reportData.alertSummary.critical} critical).`,
          confidence: 0.85,
          createdBy: actorId,
        },
      });

      await (this.prisma as any).aiAudit.create({
        data: {
          tenantId,
          aiJobId: jobId,
          promptHash,
          responseHash,
          executionTimeMs: Date.now() - startedAt,
          createdBy: actorId,
        },
      });

      await (this.prisma as any).aiJob.update({
        where: { id: jobId },
        data: {
          status: 'SUCCEEDED',
          latencyMs: Date.now() - startedAt,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });

      this.logger.log(`Finance-AI job ${jobId} SUCCEEDED`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Finance-AI job ${jobId} FAILED: ${msg}`);

      await (this.prisma as any).aiJob.upsert({
        where: { id: jobId },
        update: { status: 'FAILED', errorMsg: msg.slice(0, 500), updatedBy: actorId, version: { increment: 1 } },
        create: {
          id: jobId,
          tenantId,
          feature: 'FINANCE_REPORT',
          status: 'FAILED',
          subjectId: organizationId,
          subjectType: 'organization',
          createdBy: actorId,
        },
      }).catch((e: unknown) =>
        this.logger.error(`Failed to persist AiJob failure record: ${e instanceof Error ? e.message : String(e)}`),
      );

      throw err;
    }
  }
}
