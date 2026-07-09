import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { UsersService } from '../users/users.service';
import { OrganizationService } from '../organization/organization.service';
import { AuthPrincipal } from '../../common/decorators';
import { BulkApproveDto, BulkImportUsersDto } from './dto';
import { ApproveUserDto, RejectUserDto } from '../users/dto';
import { AuditAction } from '@prisma/client';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_BULK_SIZE = 100;

export interface BulkResult<T = unknown> {
  results: Array<{ id?: string; status: 'ok' | 'error'; data?: T; error?: string }>;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly usersService: UsersService,
    private readonly organizationService: OrganizationService,
  ) {}

  // ─── Employee approval ────────────────────────────────────────────────────

  async approveUser(caller: AuthPrincipal, id: string, dto: ApproveUserDto) {
    return this.usersService.approve(caller, id, dto);
  }

  async rejectUser(caller: AuthPrincipal, id: string, dto: RejectUserDto) {
    return this.usersService.reject(caller, id, dto);
  }

  // ─── Idempotency helpers ──────────────────────────────────────────────────

  private async checkIdempotency(tenantId: string, key: string): Promise<BulkResult | null> {
    const existing = await (this.prisma as any).idempotencyKey.findFirst({
      where: { tenantId, key, expiresAt: { gt: new Date() } },
    });
    if (existing?.resultRef) {
      try { return JSON.parse(existing.resultRef) as BulkResult; } catch { /* corrupt — reprocess */ }
    }
    return null;
  }

  private async saveIdempotency(tenantId: string, key: string, result: BulkResult): Promise<void> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
    await (this.prisma as any).idempotencyKey.upsert({
      where: { tenantId_key: { tenantId, key } } as any,
      update: { resultRef: JSON.stringify(result), expiresAt },
      create: { tenantId, key, resultRef: JSON.stringify(result), expiresAt },
    }).catch((err: Error) => this.logger.warn(`Idempotency persist failed: ${err.message}`));
  }

  // ─── GET /admin/overview ──────────────────────────────────────────────────

  async overview(tenantId: string, organizationId: string) {
    const [usersByStatus, timesheetsByStatus, pendingApprovals, rolesCount, kpiTemplatesCount] =
      await Promise.all([
        this.prisma.user.groupBy({ by: ['status'], where: { tenantId, deletedAt: null }, _count: { id: true } }),
        this.prisma.timesheet.groupBy({ by: ['status'], where: { tenantId, organizationId, deletedAt: null }, _count: { id: true } }),
        this.prisma.timesheet.count({ where: { tenantId, organizationId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, deletedAt: null } }),
        this.prisma.role.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.kpiTemplate.count({ where: { tenantId, deletedAt: null } }),
      ]);

    const users: Record<string, number> = {};
    for (const r of usersByStatus) users[r.status] = r._count.id;
    const timesheets: Record<string, number> = {};
    for (const r of timesheetsByStatus) timesheets[r.status] = r._count.id;

    return {
      users:        { total: Object.values(users).reduce((a, b) => a + b, 0), byStatus: users },
      timesheets:   { total: Object.values(timesheets).reduce((a, b) => a + b, 0), byStatus: timesheets, pendingApprovals },
      roles:        { total: rolesCount },
      kpiTemplates: { total: kpiTemplatesCount },
    };
  }

  // ─── GET /admin/user-overview ─────────────────────────────────────────────

  async userOverview(tenantId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [byStatus, byEmploymentType, recentJoiners, pendingInvites] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['status'],
        where: { tenantId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['employmentType'],
        where: { tenantId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, status: true },
      }),
      this.prisma.user.count({
        where: { tenantId, deletedAt: null, status: 'INVITED' },
      }),
    ]);

    return {
      byStatus:        Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
      byEmploymentType: Object.fromEntries(byEmploymentType.map((r) => [r.employmentType, r._count.id])),
      pendingInvites,
      recentJoiners,
    };
  }

  // ─── GET /admin/org-overview ──────────────────────────────────────────────

  async orgOverview(tenantId: string, organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { tenantId, id: organizationId, deletedAt: null },
      select: {
        id: true, name: true, slug: true, timezone: true, createdAt: true,
      },
    });

    const [departments, teams, clients, projects] = await Promise.all([
      this.prisma.department.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.team.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.client.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.project.count({ where: { tenantId, deletedAt: null } }),
    ]);

    return {
      organization: org,
      modules: { departments, teams, clients, projects },
    };
  }

  // ─── GET /admin/system-metrics ────────────────────────────────────────────

  async systemMetrics(tenantId: string) {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      totalTimesheets,
      openPayrollPeriods,
      auditLogsLast30d,
      aiJobsLast30d,
      kpiTemplates,
      notifications,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.timesheet.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.payrollPeriod.count({ where: { tenantId, status: 'OPEN', deletedAt: null } }),
      this.prisma.auditLog.count({ where: { tenantId, createdAt: { gte: since30d } } }),
      (this.prisma as any).aiJob.count({ where: { tenantId, createdAt: { gte: since30d } } }),
      this.prisma.kpiTemplate.count({ where: { tenantId, deletedAt: null } }),
      (this.prisma as any).notification.count({ where: { tenantId, deletedAt: null } }),
    ]);

    return {
      users:              { total: totalUsers, active: activeUsers },
      timesheets:         { total: totalTimesheets },
      payroll:            { openPeriods: openPayrollPeriods },
      auditLogs:          { last30Days: auditLogsLast30d },
      ai:                 { jobsLast30Days: aiJobsLast30d },
      kpiTemplates:       { total: kpiTemplates },
      notifications:      { total: notifications },
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
        nodeVersion: process.version,
      },
    };
  }

  // ─── GET /admin/health ────────────────────────────────────────────────────

  async healthSummary() {
    const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; detail?: string }> = {};

    // Database ping
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks['database'] = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err: unknown) {
      checks['database'] = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return {
      status: allOk ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      checks,
    };
  }

  // ─── GET /admin/config ────────────────────────────────────────────────────

  async getConfig(tenantId: string, organizationId: string) {
    return this.organizationService.getSettings(tenantId, organizationId);
  }

  // ─── PATCH /admin/config/:key ─────────────────────────────────────────────

  async upsertConfig(tenantId: string, organizationId: string, actorId: string, key: string, value: unknown) {
    return this.organizationService.upsertSetting(tenantId, organizationId, actorId, key, value);
  }

  // ─── POST /admin/users/import ─────────────────────────────────────────────

  async bulkImportUsers(caller: AuthPrincipal, dto: BulkImportUsersDto, idempotencyKey: string): Promise<BulkResult> {
    const cached = await this.checkIdempotency(caller.tenantId, `import:${idempotencyKey}`);
    if (cached) return cached;

    if (dto.users.length > MAX_BULK_SIZE) {
      throw new BadRequestException(`Bulk import limited to ${MAX_BULK_SIZE} users per request`);
    }

    const results: BulkResult['results'] = [];
    for (const item of dto.users) {
      try {
        const user = await this.usersService.create(caller, item as any);
        results.push({ id: (user as any).id, status: 'ok' });
      } catch (err: unknown) {
        results.push({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: caller.tenantId,
        actorId: caller.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'bulk_user_import',
        metadata: { total: dto.users.length, ok: results.filter((r) => r.status === 'ok').length, errors: results.filter((r) => r.status === 'error').length },
      },
    });

    const result: BulkResult = { results };
    await this.saveIdempotency(caller.tenantId, `import:${idempotencyKey}`, result);
    return result;
  }

  // ─── POST /admin/approvals/bulk ───────────────────────────────────────────

  async bulkApprove(caller: AuthPrincipal, dto: BulkApproveDto, idempotencyKey: string): Promise<BulkResult> {
    const cached = await this.checkIdempotency(caller.tenantId, `approve:${idempotencyKey}`);
    if (cached) return cached;

    if (dto.items.length > MAX_BULK_SIZE) {
      throw new BadRequestException(`Bulk approve limited to ${MAX_BULK_SIZE} items per request`);
    }

    const results: BulkResult['results'] = [];
    for (const item of dto.items) {
      try {
        await this.approvalsService.decide(caller, item.timesheetId, {
          action: 'APPROVE',
          expectedVersion: item.expectedVersion,
          remark: item.remark,
        } as any);
        results.push({ id: item.timesheetId, status: 'ok' });
      } catch (err: unknown) {
        results.push({ id: item.timesheetId, status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: caller.tenantId,
        actorId: caller.userId,
        action: AuditAction.APPROVE,
        entityType: 'bulk_approval',
        metadata: { total: dto.items.length, ok: results.filter((r) => r.status === 'ok').length, errors: results.filter((r) => r.status === 'error').length },
      },
    });

    const result: BulkResult = { results };
    await this.saveIdempotency(caller.tenantId, `approve:${idempotencyKey}`, result);
    return result;
  }

  // ─── GET /admin/ai-config ─────────────────────────────────────────────────

  async getAiConfig(tenantId: string, organizationId: string) {
    const settings = await this.organizationService.getSettings(tenantId, organizationId);
    const aiKeys = settings.filter((s) => s.key.startsWith('ai.'));
    const result: Record<string, { value: unknown; type: string }> = {};
    for (const s of aiKeys) {
      result[s.key] = { value: s.value, type: s.type };
    }
    return result;
  }

  // ─── PUT /admin/ai-config/toggles ─────────────────────────────────────────

  async updateAiToggles(
    tenantId: string,
    organizationId: string,
    actorId: string,
    toggles: Record<string, boolean>,
  ) {
    return this.organizationService.upsertSetting(
      tenantId,
      organizationId,
      actorId,
      'ai.toggles',
      toggles,
      'json',
    );
  }

  // ─── GET /admin/feature-flags ─────────────────────────────────────────────

  async featureFlags(tenantId: string) {
    const settings = await (this.prisma as any).organizationSetting.findMany({
      where: { tenantId, key: { startsWith: 'feature.' }, deletedAt: null },
      select: { key: true, value: true },
    });
    const flags: Record<string, unknown> = {};
    for (const s of settings) flags[(s.key as string).replace('feature.', '')] = s.value;
    return { flags };
  }
}
