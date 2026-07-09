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
    this.logger.log(`AI job ${jobId} START feature=${feature} ${subjectType}:${subjectId}`);

    try {
      // ── 1. Mark RUNNING ──────────────────────────────────────────────────
      await (this.prisma as any).aiJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING', updatedBy: triggeredBy, version: { increment: 1 } },
      });

      // ── 2. Build feature-specific prompt ──────────────────────────────────
      const handler = getFeatureHandler(feature);
      const { systemPrompt, userPrompt } = await handler(
        this.prisma as unknown as PrismaClient,
        { tenantId, feature, subjectId, subjectType, options, triggeredBy },
      );

      // ── 3. Call OpenAI provider ───────────────────────────────────────────
      const completion = await this.openAi.complete(systemPrompt, userPrompt);

      // ── 4. Persist result (no raw prompt/response — contract §4) ─────────
      await (this.prisma as any).aiResult.create({
        data: {
          tenantId,
          aiJobId: jobId,
          summary:        completion.summary,
          recommendation: completion.recommendation,
          confidence:     completion.confidence,
          createdBy: triggeredBy,
        },
      });

      // ── 5. Persist audit hashes ───────────────────────────────────────────
      await (this.prisma as any).aiAudit.create({
        data: {
          tenantId,
          aiJobId: jobId,
          promptHash:    completion.promptHash,
          responseHash:  completion.responseHash,
          executionTimeMs: completion.latencyMs,
          createdBy: triggeredBy,
        },
      });

      // ── 6. Mark SUCCEEDED ─────────────────────────────────────────────────
      await (this.prisma as any).aiJob.update({
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
