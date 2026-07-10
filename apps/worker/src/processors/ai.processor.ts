import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { OpenAiProvider } from '../ai/openai.provider';
import { getFeatureHandler } from '../ai/feature-handlers';
import { PrismaClient } from '@prisma/client';

export interface AiJobPayload {
  jobId: string;
  tenantId: string;
  feature: string;
  subjectId: string;
  subjectType: string;
  options: Record<string, unknown>;
  triggeredBy: string;
}

@Processor('ai')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiProvider,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<AiJobPayload>): Promise<void> {
    const { jobId, tenantId, feature, subjectId, subjectType, options, triggeredBy } = job.data;
    const startedAt = Date.now();
    this.logger.log(`AI job ${jobId} START attempt=${job.attemptsMade} feature=${feature} ${subjectType}:${subjectId}`);

    try {
      // ── 1. Idempotency guard — skip if already SUCCEEDED ───────────────
      const current = await (this.prisma as any).aiJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (!current) {
        this.logger.warn(`AI job ${jobId} not found in DB — skipping`);
        return;
      }
      if (current.status === 'SUCCEEDED') {
        this.logger.log(`AI job ${jobId} already SUCCEEDED — skipping`);
        return;
      }

      // ── 2. Partial-completion recovery — result exists but status is stale ──
      const existingResult = await (this.prisma as any).aiResult.findUnique({
        where: { aiJobId: jobId },
      });
      if (existingResult) {
        this.logger.log(`AI job ${jobId} has result but status=${current.status} — recovering`);
        await (this.prisma as any).aiJob.update({
          where: { id: jobId },
          data: { status: 'SUCCEEDED', updatedBy: triggeredBy, version: { increment: 1 } },
        });
        return;
      }

      // ── 3. Claim the job (only QUEUED/FAILED can transition to RUNNING) ──
      const claimed = await (this.prisma as any).aiJob.updateMany({
        where: { id: jobId, status: { in: ['QUEUED', 'FAILED'] } },
        data: { status: 'RUNNING', updatedBy: triggeredBy, version: { increment: 1 } },
      });
      // If claim.count === 0, the job is RUNNING from a crashed previous
      // attempt — proceed (no AiResult exists, we checked in step 2).

      // ── 4. Build feature-specific prompt ──────────────────────────────────
      const handler = getFeatureHandler(feature);
      const { systemPrompt, userPrompt } = await handler(
        this.prisma as unknown as PrismaClient,
        { tenantId, feature, subjectId, subjectType, options, triggeredBy },
      );

      // ── 5. Call OpenAI provider (external — may be called again on
      //      crash-retry in the narrow window after step 2 but before
      //      the $transaction below; the AiJobId unique constraint on
      //      AiResult prevents any duplicate DB records). ───────────────
      const completion = await this.openAi.complete(systemPrompt, userPrompt);

      // ── 6. Persist result + audit + status atomically ─────────────────────
      await (this.prisma as any).$transaction(async (tx: any) => {
        // Final idempotency check inside transaction (safety net for concurrent retries)
        const alreadyDone = await tx.aiResult.findUnique({
          where: { aiJobId: jobId },
        });
        if (alreadyDone) {
          this.logger.log(`AI job ${jobId} result persisted by another retry — recovering status`);
          await tx.aiJob.update({
            where: { id: jobId },
            data: { status: 'SUCCEEDED', updatedBy: triggeredBy, version: { increment: 1 } },
          });
          return;
        }

        await tx.aiResult.create({
          data: {
            tenantId,
            aiJobId: jobId,
            summary:        completion.summary,
            recommendation: completion.recommendation,
            confidence:     completion.confidence,
            createdBy: triggeredBy,
          },
        });

        await tx.aiAudit.create({
          data: {
            tenantId,
            aiJobId: jobId,
            promptHash:    completion.promptHash,
            responseHash:  completion.responseHash,
            executionTimeMs: completion.latencyMs,
            createdBy: triggeredBy,
          },
        });

        await tx.aiJob.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            provider: this.config.get<string>('ai.provider') ?? 'OPENAI',
            model: this.config.get<string>('ai.openaiModel') ?? 'unknown',
            latencyMs: completion.latencyMs,
            totalTokens: completion.totalTokens,
            updatedBy: triggeredBy,
            version: { increment: 1 },
          },
        });
      });

      this.logger.log(`AI job ${jobId} SUCCEEDED feature=${feature} ${completion.latencyMs}ms ${completion.totalTokens}tok`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI job ${jobId} FAILED: ${msg}`);

      await (this.prisma as any).aiJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMsg: msg.slice(0, 500),
          latencyMs: Date.now() - startedAt,
          updatedBy: triggeredBy,
          version: { increment: 1 },
        },
      }).catch(() => { /* swallow — already failed */ });

      throw err; // let BullMQ retry (attempts: 3, exponential backoff)
    }
  }
}
