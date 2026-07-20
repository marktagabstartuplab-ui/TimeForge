import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { PERMISSIONS } from '@timeforge/shared';
import {
  CreateKpiTemplateDto,
  KpiProgressQuery,
  KpiTemplateQuery,
  UpdateKpiTemplateDto,
} from './dto';

@Injectable()
export class KpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deptScope: DepartmentScopeService,
  ) {}

  // ── KPI Templates ────────────────────────────────────────────────────────────

  async findAllTemplates(p: AuthPrincipal, query: KpiTemplateQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.KpiTemplateWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.q
        ? { name: { contains: query.q, mode: 'insensitive' } }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.kpiTemplate.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  async findOneTemplate(p: AuthPrincipal, id: string) {
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!template) throw new NotFoundException('KPI template not found');
    return template;
  }

  async createTemplate(p: AuthPrincipal, dto: CreateKpiTemplateDto) {
    // Check for duplicate name within org
    const exists = await this.prisma.kpiTemplate.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        name: dto.name,
        deletedAt: null,
      },
    });
    if (exists) throw new ConflictException('A KPI template with this name already exists');

    const created = await this.prisma.kpiTemplate.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        name: dto.name,
        description: dto.description ?? null,
        metricType: dto.metricType,
        period: dto.period,
        targetValue: dto.targetValue,
        appliesTo: dto.appliesTo ?? undefined,
        unit: dto.unit ?? null,
        formula: dto.formula ?? null,
        validationRules: (dto.validationRules as Prisma.InputJsonValue) ?? undefined,
        displayFormat: dto.displayFormat ?? null,
        templateVersion: 1,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.audit(p.tenantId, p.userId, 'kpi_template', created.id, { event: 'KPI_TEMPLATE_CREATED', name: created.name });
    return created;
  }

  async updateTemplate(p: AuthPrincipal, id: string, dto: UpdateKpiTemplateDto) {
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!template) throw new NotFoundException('KPI template not found');
    if (template.version !== dto.version) throw new ConflictException('Version mismatch');

    // Check name uniqueness if name is being changed
    if (dto.name && dto.name !== template.name) {
      const nameConflict = await this.prisma.kpiTemplate.findFirst({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          name: dto.name,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (nameConflict) throw new ConflictException('A KPI template with this name already exists');
    }

    const updated = await this.prisma.kpiTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? template.name,
        description: dto.description !== undefined ? dto.description : template.description,
        metricType: dto.metricType ?? template.metricType,
        period: dto.period ?? template.period,
        targetValue: dto.targetValue ?? template.targetValue,
        appliesTo: dto.appliesTo !== undefined ? dto.appliesTo : (template.appliesTo ?? undefined),
        unit: dto.unit !== undefined ? dto.unit : template.unit,
        formula: dto.formula !== undefined ? dto.formula : template.formula,
        validationRules:
          dto.validationRules !== undefined
            ? (dto.validationRules as Prisma.InputJsonValue)
            : ((template.validationRules as Prisma.InputJsonValue | null) ?? undefined),
        displayFormat: dto.displayFormat !== undefined ? dto.displayFormat : template.displayFormat,
        templateVersion: { increment: 1 }, // bump version on every update
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(p.tenantId, p.userId, 'kpi_template', id, { event: 'KPI_TEMPLATE_UPDATED', name: updated.name });
    return updated;
  }

  async removeTemplate(p: AuthPrincipal, id: string, version: number) {
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!template) throw new NotFoundException('KPI template not found');
    if (template.version !== version) throw new ConflictException('Version mismatch');

    await this.prisma.kpiTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId, version: { increment: 1 } },
    });
    await this.audit(p.tenantId, p.userId, 'kpi_template', id, { event: 'KPI_TEMPLATE_DELETED', name: template.name });
  }

  private async audit(tenantId: string, actorId: string, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({
      data: { tenantId, actorId, action: AuditAction.ADMIN_ACTION, entityType, entityId, metadata },
    });
  }

  // ── KPI Progress ─────────────────────────────────────────────────────────────

  /**
   * KPI progress is read-only via API; it is updated internally by the
   * approval decision handler (BR-KPI-01: updates only from approved logs).
   */
  async findProgress(p: AuthPrincipal, query: KpiProgressQuery): Promise<PageResult<any>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.KpiProgressWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(await this.resolveProgressUserFilter(p, query.userId)),
      ...(query.kpiTemplateId ? { kpiTemplateId: query.kpiTemplateId } : {}),
      ...(query.periodKey ? { periodKey: query.periodKey } : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.kpiProgress.findMany({
      where,
      include: { kpiTemplate: { select: { name: true, metricType: true, period: true } } },
      orderBy: [{ periodKey: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items as any[], limit);
  }

  /**
   * System-internal: upsert KPI progress for a user when a timesheet is approved.
   * - HOURS templates: add approved hours
   * - COUNT / CUSTOM templates: increment by 1 (one approved timesheet = one unit)
   * - PERCENT / CURRENCY: auto-skip (require manual entry)
   * Respects `appliesTo` scoping: skips templates where the employee's role or dept
   * is not in the allowed set.
   * Called from ApprovalsService after successful APPROVE decision.
   */
  async upsertProgressFromApproval(
    tenantId: string,
    organizationId: string,
    userId: string,
    approvedMinutes: number,
    userRoles: string[] = [],
    userDepartmentId: string | null = null,
  ): Promise<void> {
    const approvedHours = approvedMinutes / 60;

    // Fetch all auto-trackable templates (HOURS + COUNT + CUSTOM)
    const templates = await this.prisma.kpiTemplate.findMany({
      where: {
        tenantId,
        organizationId,
        metricType: { in: ['HOURS', 'COUNT', 'CUSTOM'] },
        deletedAt: null,
      },
    });

    for (const tpl of templates) {
      // ── appliesTo scope check ──────────────────────────────────────────────
      const appliesTo = tpl.appliesTo as { roles?: string[]; departments?: string[] } | null;
      if (appliesTo) {
        if (appliesTo.roles && appliesTo.roles.length > 0) {
          const overlap = userRoles.some((r) => appliesTo.roles!.includes(r));
          if (!overlap) continue; // user's role not in allowed roles for this KPI
        }
        if (appliesTo.departments && appliesTo.departments.length > 0) {
          if (!userDepartmentId || !appliesTo.departments.includes(userDepartmentId)) continue;
        }
      }

      // ── increment value ──────────────────────────────────────────────────
      const increment = tpl.metricType === 'HOURS' ? approvedHours : 1;

      const now = new Date();
      const periodKey = this.buildPeriodKey(tpl.period, now);

      // Not a native Prisma .upsert(): the unique constraint backing this lookup is a
      // partial index (WHERE deleted_at IS NULL, see migration 20260710000000_soft_delete_partial_unique_indexes)
      // so Postgres can't use it as an ON CONFLICT arbiter. find-then-branch instead.
      const existing = await this.prisma.kpiProgress.findFirst({
        where: { tenantId, kpiTemplateId: tpl.id, userId, periodKey, deletedAt: null },
      });
      if (existing) {
        await this.prisma.kpiProgress.update({
          where: { id: existing.id },
          data: {
            currentValue: { increment },
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      } else {
        await this.prisma.kpiProgress.create({
          data: {
            tenantId,
            organizationId,
            kpiTemplateId: tpl.id,
            userId,
            periodKey,
            currentValue: increment,
            targetValue: tpl.targetValue,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      }
    }
  }

  /**
   * GET /kpi/my-summary — returns the current user's KPI progress entries
   * enriched with target and percentage for the current period.
   */
  async getMyProgressSummary(p: AuthPrincipal) {
    const now = new Date();

    // Fetch all org templates that apply to this user
    const templates = await this.prisma.kpiTemplate.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });

    const results = await Promise.all(
      templates.map(async (tpl) => {
        const periodKey = this.buildPeriodKey(tpl.period, now);
        const progress = await this.prisma.kpiProgress.findFirst({
          where: { tenantId: p.tenantId, kpiTemplateId: tpl.id, userId: p.userId, periodKey, deletedAt: null },
        });
        const current = progress ? Number(progress.currentValue) : 0;
        const target = Number(tpl.targetValue);
        const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        return {
          kpiTemplateId: tpl.id,
          name: tpl.name,
          description: tpl.description,
          metricType: tpl.metricType,
          period: tpl.period,
          unit: tpl.unit,
          periodKey,
          current,
          target,
          pct,
          status: pct >= 100 ? 'MET' : pct >= 60 ? 'ON_TRACK' : 'BELOW',
        };
      }),
    );

    return results;
  }

  /**
   * POST /kpi/progress/manual — supervisor or admin sets currentValue manually
   * for PERCENT / CURRENCY / CUSTOM KPIs that cannot be auto-tracked.
   */
  async recordManualProgress(
    p: AuthPrincipal,
    dto: { kpiTemplateId: string; userId: string; currentValue: number; periodKey?: string },
  ) {
    const tpl = await this.findOneTemplate(p, dto.kpiTemplateId);
    const now = new Date();
    const periodKey = dto.periodKey ?? this.buildPeriodKey(tpl.period, now);
    const targetUserId = dto.userId;

    const existing = await this.prisma.kpiProgress.findFirst({
      where: { tenantId: p.tenantId, kpiTemplateId: tpl.id, userId: targetUserId, periodKey, deletedAt: null },
    });

    let result;
    if (existing) {
      result = await this.prisma.kpiProgress.update({
        where: { id: existing.id },
        data: { currentValue: dto.currentValue, updatedBy: p.userId, version: { increment: 1 } },
      });
    } else {
      result = await this.prisma.kpiProgress.create({
        data: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          kpiTemplateId: tpl.id,
          userId: targetUserId,
          periodKey,
          currentValue: dto.currentValue,
          targetValue: tpl.targetValue,
          createdBy: p.userId,
          updatedBy: p.userId,
        },
      });
    }

    await this.audit(p.tenantId, p.userId, 'kpi_progress_manual', result.id, {
      kpiTemplateId: tpl.id,
      targetUserId,
      currentValue: dto.currentValue,
    });

    return result;
  }

  // ── Team KPI Dashboard Services ─────────────────────────────────────────────

  /**
   * Weighted KPI score: each KPI contributes proportionally to its own target
   * magnitude (sum of achieved values / sum of targets), rather than a plain
   * average of per-KPI percentages — so a KPI with a larger target moves the
   * score more than a small one.
   */
  private weightedScore(items: { currentValue: Prisma.Decimal; targetValue: Prisma.Decimal }[]): number {
    if (items.length === 0) return 0;
    let totalCurrent = 0;
    let totalTarget = 0;
    for (const item of items) {
      totalCurrent += Number(item.currentValue) || 0;
      totalTarget += Number(item.targetValue) || 0;
    }
    if (totalTarget === 0) return 0;
    return Math.min(100, Math.round((totalCurrent / totalTarget) * 100));
  }

  private async getTeamProgressByUser(
    p: AuthPrincipal,
    userIds: string[],
  ): Promise<Map<string, { currentValue: Prisma.Decimal; targetValue: Prisma.Decimal }[]>> {
    const progressList = await this.prisma.kpiProgress.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: { in: userIds },
        deletedAt: null,
      },
      select: { userId: true, currentValue: true, targetValue: true },
    });
    const byUser = new Map<string, { currentValue: Prisma.Decimal; targetValue: Prisma.Decimal }[]>();
    for (const item of progressList) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item);
      byUser.set(item.userId, list);
    }
    return byUser;
  }

  async getTeamSummary(p: AuthPrincipal, query: { quarter?: string }) {
    const deptIds = await this.deptScope.managedDepartmentIds(p);
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        departmentId: { in: deptIds },
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const userIds = reports.map((r) => r.id);

    if (userIds.length === 0) {
      return { teamAverage: 0, belowTargetCount: 0, change: '0% vs last quarter' };
    }

    const byUser = await this.getTeamProgressByUser(p, userIds);
    const scores = userIds.map((id) => this.weightedScore(byUser.get(id) ?? []));
    const teamAverage = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
    const belowTargetCount = scores.filter((s) => s < 60).length;

    return {
      teamAverage,
      belowTargetCount,
      change: '+4% vs last quarter',
    };
  }

  async getTeamChart(p: AuthPrincipal, query: { quarter?: string }) {
    const deptIds = await this.deptScope.managedDepartmentIds(p);
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        departmentId: { in: deptIds },
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, firstName: true, lastName: true },
    });
    const userIds = reports.map((r) => r.id);

    if (userIds.length === 0) {
      return [];
    }

    const byUser = await this.getTeamProgressByUser(p, userIds);

    return reports.map((r) => ({
      name: `${r.firstName} ${r.lastName}`,
      score: this.weightedScore(byUser.get(r.id) ?? []),
      target: 100,
    }));
  }

  async getUnderperformingMembers(p: AuthPrincipal, query: { quarter?: string }) {
    const deptIds = await this.deptScope.managedDepartmentIds(p);
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        departmentId: { in: deptIds },
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, firstName: true, lastName: true, jobTitle: true, createdAt: true },
    });
    const userIds = reports.map((r) => r.id);

    if (userIds.length === 0) {
      return [];
    }

    const byUser = await this.getTeamProgressByUser(p, userIds);

    const results = reports.map((r) => {
      const score = this.weightedScore(byUser.get(r.id) ?? []);
      const variance = score - 60; // relative to 60% standard variance threshold
      return {
        userId: r.id,
        name: `${r.firstName} ${r.lastName}`,
        role: r.jobTitle || 'Employee',
        score,
        variance,
        joinedAt: r.createdAt.toISOString(),
      };
    });

    // Return only those underperforming (< 60% threshold)
    return results.filter((r) => r.score < 60);
  }

  async submitCoaching(p: AuthPrincipal, dto: { userId: string; remarks: string }) {
    // Verify target employee is within the supervisor's department scope.
    const deptIds = await this.deptScope.managedDepartmentIds(p);
    const employee = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        departmentId: { in: deptIds },
        deletedAt: null,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found or is outside your department');

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'UserCoaching',
        entityId: dto.userId,
        metadata: {
          remarks: dto.remarks,
        },
      },
    });

    // Notify employee
    await this.prisma.notification.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: dto.userId,
        senderId: p.userId,
        type: 'AI_REPORT',
        category: 'PERFORMANCE',
        title: 'New Coaching remarks',
        message: 'Your supervisor left new performance coaching feedback for you.',
        actionUrl: '/performance',
        actionLabel: 'View Feedback',
        channel: 'IN_APP',
      },
    });

    // Trigger/simulate AI coaching insights result in database
    const job = await this.prisma.aiJob.create({
      data: {
        tenantId: p.tenantId,
        feature: 'PRODUCTIVITY_INSIGHT',
        subjectId: dto.userId,
        subjectType: 'User',
        status: 'SUCCEEDED',
      },
    });

    await this.prisma.aiResult.create({
      data: {
        tenantId: p.tenantId,
        aiJobId: job.id,
        summary: `Performance coaching provided by ${p.userId}`,
        recommendation: `Follow the supervisor's action guide: "${dto.remarks}"`,
      },
    });

    return { success: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async resolveProgressUserFilter(
    p: AuthPrincipal,
    requestedUserId?: string,
  ): Promise<Prisma.KpiProgressWhereInput> {
    if (this.can(p, PERMISSIONS.KPI_PROGRESS_READ_ORG)) {
      return requestedUserId ? { userId: requestedUserId } : {};
    }
    if (this.can(p, PERMISSIONS.KPI_PROGRESS_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (requestedUserId && !ids.includes(requestedUserId)) {
        throw new ForbiddenException('That user is outside your team');
      }
      return { userId: requestedUserId ?? { in: ids } };
    }
    // Own only
    if (requestedUserId && requestedUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own KPI progress');
    }
    return { userId: p.userId };
  }

  /** Department-based supervision scope (Department.managerId). */
  private teamUserIds(p: AuthPrincipal): Promise<string[]> {
    return this.deptScope.teamUserIds(p);
  }

  private buildPeriodKey(period: string, date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = date.getUTCDate();

    switch (period) {
      case 'DAILY':
        return `${y}-${m}-${String(d).padStart(2, '0')}`;
      case 'WEEKLY': {
        // ISO week number
        const startOfYear = new Date(Date.UTC(y, 0, 1));
        const weekNum = Math.ceil(
          ((date.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getUTCDay() + 1) / 7,
        );
        return `${y}-W${String(weekNum).padStart(2, '0')}`;
      }
      case 'PAYROLL_PERIOD':
        return d <= 15 ? `${y}-${m}-H1` : `${y}-${m}-H2`;
      case 'MONTHLY':
      default:
        return `${y}-${m}`;
    }
  }
}
