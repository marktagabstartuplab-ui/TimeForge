import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { AuditAction } from '@prisma/client';
import { buildPage, decodeCursor } from '../../common/crud/crud.service';
import {
  ALL_AI_FEATURES,
  AiFeatureKey,
  OWN_FEATURES,
  TEAM_FEATURES,
  TriggerAiJobDto,
} from './dto';

export const AI_QUEUE = 'ai';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private resolveRequiredPermission(feature: AiFeatureKey): string {
    if ((OWN_FEATURES as readonly string[]).includes(feature))  return 'ai:trigger_self';
    if ((TEAM_FEATURES as readonly string[]).includes(feature)) return 'ai:trigger_team';
    return 'ai:trigger_org';
  }

  private hasPermission(user: AuthPrincipal, perm: string): boolean {
    return user.permissions.includes('*') || user.permissions.includes(perm);
  }

  // ─── Idempotency helpers ──────────────────────────────────────────────────

  private async checkIdempotency(tenantId: string, key: string): Promise<string | null> {
    const existing = await (this.prisma as any).idempotencyKey.findFirst({
      where: { tenantId, key, expiresAt: { gt: new Date() } },
    });
    return existing?.resultRef ?? null;
  }

  private async saveIdempotency(tenantId: string, key: string, jobId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
    await (this.prisma as any).idempotencyKey.upsert({
      where: { tenantId_key: { tenantId, key } } as any,
      update: { resultRef: jobId, expiresAt },
      create: { tenantId, key, resultRef: jobId, expiresAt },
    }).catch(() => { /* non-fatal */ });
  }

  // ─── Subject validation ───────────────────────────────────────────────────

  private async validateSubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    let found = false;

    switch (subjectType) {
      case 'timesheet':
        found = !!(await this.prisma.timesheet.findFirst({
          where: { id: subjectId, tenantId, deletedAt: null },
          select: { id: true },
        }));
        break;
      case 'user':
        found = !!(await this.prisma.user.findFirst({
          where: { id: subjectId, tenantId, deletedAt: null },
          select: { id: true },
        }));
        break;
      case 'payroll_period':
        found = !!(await this.prisma.payrollPeriod.findFirst({
          where: { id: subjectId, tenantId },
          select: { id: true },
        }));
        break;
      case 'kpi_template':
        found = !!(await this.prisma.kpiTemplate.findFirst({
          where: { id: subjectId, tenantId, deletedAt: null },
          select: { id: true },
        }));
        break;
      default:
        throw new UnprocessableEntityException(`Unknown subjectType: ${subjectType}`);
    }

    if (!found) {
      throw new UnprocessableEntityException(
        `Subject ${subjectType}:${subjectId} not found in this tenant`,
      );
    }
  }

  // ─── Feature toggle check ────────────────────────────────────────────────

  private async checkFeatureEnabled(tenantId: string, organizationId: string, feature: string): Promise<void> {
    const setting = await this.prisma.organizationSetting.findFirst({
      where: { tenantId, organizationId, key: 'ai.toggles', deletedAt: null },
    });
    if (!setting) return;
    const toggles = setting.value as Record<string, boolean> | null;
    if (toggles && toggles[feature] === false) {
      throw new UnprocessableEntityException(`AI feature "${feature}" is disabled by organization settings`);
    }
  }

  // ─── Trigger job ─────────────────────────────────────────────────────────

  async triggerJob(
    user: AuthPrincipal,
    dto: TriggerAiJobDto,
    idempotencyKey: string,
  ) {
    // Permission check
    const requiredPerm = this.resolveRequiredPermission(dto.feature);
    if (!this.hasPermission(user, requiredPerm)) {
      throw new ForbiddenException(
        `Feature ${dto.feature} requires permission ${requiredPerm}`,
      );
    }

    // Feature toggle check
    await this.checkFeatureEnabled(user.tenantId, user.organizationId, dto.feature);

    // Idempotency: return cached jobId if key already used
    const idemKey = `ai:${idempotencyKey}`;
    const cached = await this.checkIdempotency(user.tenantId, idemKey);
    if (cached) {
      const job = await (this.prisma as any).aiJob.findFirst({
        where: { id: cached, tenantId: user.tenantId },
        select: { id: true, status: true },
      });
      if (job) return { jobId: job.id, status: job.status };
    }

    // Validate subject exists and belongs to tenant
    await this.validateSubject(user.tenantId, dto.subjectType, dto.subjectId);

    // Create AiJob record
    const aiJob = await (this.prisma as any).aiJob.create({
      data: {
        tenantId: user.tenantId,
        feature: dto.feature,
        subjectId: dto.subjectId,
        subjectType: dto.subjectType,
        status: 'QUEUED',
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: AuditAction.AI_USAGE,
        entityType: 'ai_job',
        entityId: aiJob.id,
        metadata: { feature: dto.feature, subjectType: dto.subjectType, subjectId: dto.subjectId },
      },
    });

    // Enqueue BullMQ job
    await this.aiQueue.add(
      'process',
      {
        jobId: aiJob.id,
        tenantId: user.tenantId,
        feature: dto.feature,
        subjectId: dto.subjectId,
        subjectType: dto.subjectType,
        options: dto.options ?? {},
        triggeredBy: user.userId,
      },
      { jobId: aiJob.id, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.saveIdempotency(user.tenantId, idemKey, aiJob.id);

    return { jobId: aiJob.id, status: 'QUEUED' };
  }

  // ─── List jobs ───────────────────────────────────────────────────────────

  async listJobs(user: AuthPrincipal, query: Record<string, string>) {
    const limit  = Math.min(Number(query['limit'] ?? 20), 100);
    const cursor = query['cursor'] ? decodeCursor(query['cursor']) : undefined;

    const where: Record<string, unknown> = { tenantId: user.tenantId };

    // Non-admin callers see only their own jobs unless they have ai:read_org
    if (!user.permissions.includes('*') && !user.permissions.includes('ai:read_org')) {
      where['createdBy'] = user.userId;
    }

    if (query['feature']) where['feature'] = query['feature'];
    if (query['status'])  where['status']  = query['status'];

    const rows = await (this.prisma as any).aiJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, feature: true, status: true,
        subjectType: true, subjectId: true,
        totalTokens: true, latencyMs: true, errorMsg: true,
        createdAt: true, updatedAt: true,
      },
    });

    return buildPage(rows, limit);
  }

  // ─── Job status ───────────────────────────────────────────────────────────

  async getJob(user: AuthPrincipal, id: string) {
    const job = await (this.prisma as any).aiJob.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        feature: true,
        status: true,
        subjectType: true,
        subjectId: true,
        totalTokens: true,
        latencyMs: true,
        errorMsg: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) throw new NotFoundException(`AI job ${id} not found`);
    return job;
  }

  // ─── Result ───────────────────────────────────────────────────────────────

  async getResult(user: AuthPrincipal, jobId: string) {
    // Verify job belongs to tenant
    const job = await (this.prisma as any).aiJob.findFirst({
      where: { id: jobId, tenantId: user.tenantId },
      select: { id: true, status: true, feature: true },
    });
    if (!job) throw new NotFoundException(`AI job ${jobId} not found`);

    const result = await (this.prisma as any).aiResult.findFirst({
      where: { aiJobId: jobId, tenantId: user.tenantId },
      select: {
        id: true,
        summary: true,
        recommendation: true,
        confidence: true,
        createdAt: true,
      },
    });

    if (!result) {
      throw new NotFoundException(
        `No result yet for job ${jobId} (status: ${job.status})`,
      );
    }

    // No raw prompt / response returned (Phase 4 contract)
    return { jobId, feature: job.feature, ...result };
  }
}
