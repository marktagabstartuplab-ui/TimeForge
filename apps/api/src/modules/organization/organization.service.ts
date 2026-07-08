import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentsService } from '../departments/departments.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateOrgDto, CreateHolidayDto, ExportOrgStructureDto } from './dto';

export const ORGANIZATION_EXPORT_QUEUE = 'organization-export';

export interface OrganizationExportJobData {
  tenantId: string;
  organizationId: string;
  format: 'CSV' | 'EXCEL' | 'PDF';
  actorId: string;
}

const KNOWN_SETTING_TYPES: Record<string, string> = {
  'timezone': 'scalar',
  'payroll.periods': 'json',
  'payroll.overtime': 'json',
  'schedule.workweek': 'json',
  'ai.provider': 'scalar',
  'ai.model': 'scalar',
  'ai.toggles': 'json',
  'ai.token_budget': 'scalar',
};

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly departments: DepartmentsService,
    private readonly projects: ProjectsService,
    @InjectQueue(ORGANIZATION_EXPORT_QUEUE) private readonly exportQueue: Queue<OrganizationExportJobData>,
  ) {}

  // ── Profile ─────────────────────────────────────────────────────────────────

  async getOrg(tenantId: string, organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, tenantId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrg(
    tenantId: string,
    organizationId: string,
    actorId: string,
    dto: UpdateOrgDto,
  ) {
    await this.getOrg(tenantId, organizationId);
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { ...dto, updatedBy: actorId, version: { increment: 1 } },
    });
    await this.audit(tenantId, actorId, AuditAction.SETTINGS_CHANGE, 'organization', organizationId);
    return updated;
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  async getSettings(tenantId: string, organizationId: string) {
    return this.prisma.organizationSetting.findMany({
      where: { tenantId, organizationId, deletedAt: null },
      orderBy: { key: 'asc' },
    });
  }

  async upsertSetting(
    tenantId: string,
    organizationId: string,
    actorId: string,
    key: string,
    value: unknown,
    typeHint?: string,
  ) {
    const type = typeHint ?? KNOWN_SETTING_TYPES[key] ?? 'json';
    if (type === 'scalar' && typeof value !== 'string' && typeof value !== 'number') {
      throw new UnprocessableEntityException(`Setting '${key}' expects a scalar value`);
    }
    const result = await this.prisma.organizationSetting.upsert({
      where: { tenantId_organizationId_key: { tenantId, organizationId, key } },
      update: { value: value as object, type, updatedBy: actorId, version: { increment: 1 } },
      create: { tenantId, organizationId, key, value: value as object, type, createdBy: actorId, updatedBy: actorId },
    });
    await this.audit(tenantId, actorId, AuditAction.SETTINGS_CHANGE, 'setting', result.id);
    return result;
  }

  // ── Holidays ─────────────────────────────────────────────────────────────────

  async getHolidays(tenantId: string, organizationId: string) {
    return this.prisma.holiday.findMany({
      where: { tenantId, organizationId, deletedAt: null },
      orderBy: { date: 'asc' },
    });
  }

  async createHoliday(
    tenantId: string,
    organizationId: string,
    actorId: string,
    dto: CreateHolidayDto,
  ) {
    try {
      const holiday = await this.prisma.holiday.create({
        data: {
          tenantId,
          organizationId,
          name: dto.name,
          date: new Date(dto.date),
          recurring: dto.recurring ?? false,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'holiday', holiday.id);
      return holiday;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') throw new ConflictException('Holiday already exists for this date and name');
      throw err;
    }
  }

  async removeHoliday(
    tenantId: string,
    organizationId: string,
    actorId: string,
    id: string,
    version: number,
  ) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, tenantId, organizationId, deletedAt: null },
    });
    if (!holiday) throw new NotFoundException('Holiday not found');
    if (holiday.version !== version) throw new ConflictException('Version mismatch');
    await this.prisma.holiday.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId, version: { increment: 1 } },
    });
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'holiday', id);
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, organizationId: string) {
    const cacheKey = `org:dashboard:${organizationId}`;
    const cached = await this.cache.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      deptPage,
      projPage,
      totalDepartments,
      departmentsAddedThisMonth,
      totalProjects,
      projectsAddedThisMonth,
      totalEmployees,
      activeEmployees,
      weekAgg,
    ] = await Promise.all([
      this.departments.findAll(tenantId, organizationId, { limit: 50 }),
      this.projects.findAll(tenantId, organizationId, { limit: 50 }),
      this.prisma.department.count({ where: { tenantId, organizationId, deletedAt: null } }),
      this.prisma.department.count({ where: { tenantId, organizationId, deletedAt: null, createdAt: { gte: startOfMonth } } }),
      this.prisma.project.count({ where: { tenantId, organizationId, deletedAt: null } }),
      this.prisma.project.count({ where: { tenantId, organizationId, deletedAt: null, createdAt: { gte: startOfMonth } } }),
      this.prisma.user.count({ where: { tenantId, organizationId, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId, organizationId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.timeEntry.aggregate({
        where: { tenantId, organizationId, deletedAt: null, startTime: { gte: startOfWeek } },
        _sum: { durationMinutes: true },
      }),
    ]);

    const loggedHours = (weekAgg._sum.durationMinutes ?? 0) / 60;
    const capacityHours = activeEmployees * 40; // standard 40h work week per active employee
    const resourceUtilization = capacityHours > 0 ? Math.min(100, Math.round((loggedHours / capacityHours) * 100)) : 0;

    const result = {
      summary: {
        totalDepartments,
        departmentsAddedThisMonth,
        activeProjects: totalProjects,
        projectsAddedThisMonth,
        totalEmployees,
        resourceUtilization,
      },
      departments: deptPage.data,
      projects: projPage.data,
      generatedAt: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, result, 120);
    return result;
  }

  // ── Hierarchy ────────────────────────────────────────────────────────────────

  async getHierarchy(tenantId: string, organizationId: string) {
    const departments = await this.prisma.department.findMany({
      where: { tenantId, organizationId, deletedAt: null },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        teams: { where: { deletedAt: null }, select: { id: true, name: true, supervisorId: true, _count: { select: { users: true } } } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    const supervisorIds = [...new Set(departments.flatMap((d) => d.teams.map((t) => t.supervisorId).filter((id): id is string => !!id)))];
    const supervisors = supervisorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: supervisorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const supervisorMap = new Map(supervisors.map((s) => [s.id, s]));

    return {
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        manager: d.manager,
        staffCount: d._count.users,
        teams: d.teams.map((t) => ({
          id: t.id,
          name: t.name,
          supervisor: t.supervisorId ? (supervisorMap.get(t.supervisorId) ?? null) : null,
          memberCount: t._count.users,
        })),
      })),
    };
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  async getAnalytics(tenantId: string, organizationId: string) {
    const departments = await this.prisma.department.findMany({
      where: { tenantId, organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const userGroups = await this.prisma.user.groupBy({
      by: ['departmentId'],
      where: { tenantId, organizationId, deletedAt: null, departmentId: { not: null } },
      _count: { _all: true },
    });
    const employeeCountByDept = new Map(userGroups.map((g) => [g.departmentId, g._count._all]));

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const entries = await this.prisma.timeEntry.findMany({
      where: { tenantId, organizationId, deletedAt: null, startTime: { gte: since } },
      select: { durationMinutes: true, user: { select: { departmentId: true } } },
    });
    const minutesByDept = new Map<string, number>();
    for (const entry of entries) {
      const deptId = entry.user.departmentId;
      if (!deptId) continue;
      minutesByDept.set(deptId, (minutesByDept.get(deptId) ?? 0) + (entry.durationMinutes ?? 0));
    }

    return {
      departmentDistribution: departments.map((d) => ({
        departmentId: d.id,
        name: d.name,
        employeeCount: employeeCountByDept.get(d.id) ?? 0,
      })),
      resourceAllocation: departments.map((d) => ({
        departmentId: d.id,
        name: d.name,
        totalHours: Math.round(((minutesByDept.get(d.id) ?? 0) / 60) * 10) / 10,
      })),
    };
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  /** Enqueues a BullMQ job to generate the org structure export, then awaits
   *  completion so the HTTP response still carries the final download URL. */
  async exportStructure(user: AuthPrincipal, dto: ExportOrgStructureDto) {
    const jobId = randomUUID();
    await this.exportQueue.add(
      'export',
      { tenantId: user.tenantId, organizationId: user.organizationId, format: dto.format, actorId: user.userId },
      { jobId, attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
    );

    await this.audit(user.tenantId, user.userId, AuditAction.ADMIN_ACTION, 'organization_export', jobId, {
      event: 'ORGANIZATION_EXPORTED',
      format: dto.format,
    });

    return { jobId };
  }

  private async audit(
    tenantId: string,
    actorId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action, entityType, entityId, metadata } });
  }
}
