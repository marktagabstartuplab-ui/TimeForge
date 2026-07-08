import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, ListQuery, PageResult } from '../../common/crud/crud.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';

const PROJECT_INCLUDE = {
  department: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.ProjectInclude;

type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Real "assigned team" signal: distinct users who have logged time against each project. */
  private async teamSizeByProject(tenantId: string, projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.timeEntry.findMany({
      where: { tenantId, projectId: { in: projectIds }, deletedAt: null },
      select: { projectId: true, userId: true },
      distinct: ['projectId', 'userId'],
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.projectId) continue;
      counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);
    }
    return counts;
  }

  private async shapeProjects(tenantId: string, items: ProjectWithRelations[]) {
    const teamSizes = await this.teamSizeByProject(tenantId, items.map((p) => p.id));
    return items.map((p) => ({ ...p, teamSize: teamSizes.get(p.id) ?? 0 }));
  }

  async findAll(tenantId: string, orgId: string, query: ListQuery): Promise<PageResult<Awaited<ReturnType<typeof this.shapeProjects>>[number]>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};
    const nameWhere = query.q ? { name: { contains: String(query.q), mode: 'insensitive' as const } } : {};
    const clientWhere = query.clientId ? { clientId: String(query.clientId) } : {};
    const departmentWhere = query.departmentId ? { departmentId: String(query.departmentId) } : {};
    const statusWhere = query.status ? { status: query.status as ProjectStatus } : {};
    const billableWhere = query.billable !== undefined ? { billable: query.billable === 'true' } : {};
    const items = await this.prisma.project.findMany({
      where: {
        tenantId,
        organizationId: orgId,
        deletedAt: null,
        ...cursorWhere,
        ...nameWhere,
        ...clientWhere,
        ...departmentWhere,
        ...statusWhere,
        ...billableWhere,
      },
      include: PROJECT_INCLUDE,
      orderBy: { name: 'asc' },
      take: limit + 1,
    });
    const page = buildPage(items, limit);
    return { data: await this.shapeProjects(tenantId, page.data), page: page.page };
  }

  async findOne(tenantId: string, orgId: string, id: string) {
    const item = await this.prisma.project.findFirst({
      where: { id, tenantId, organizationId: orgId, deletedAt: null },
      include: PROJECT_INCLUDE,
    });
    if (!item) throw new NotFoundException('Project not found');
    const [shaped] = await this.shapeProjects(tenantId, [item]);
    return shaped;
  }

  private async validateDepartment(tenantId: string, orgId: string, departmentId: string): Promise<void> {
    const dept = await this.prisma.department.findFirst({ where: { id: departmentId, tenantId, organizationId: orgId, deletedAt: null } });
    if (!dept) throw new NotFoundException('Department not found');
  }

  async create(tenantId: string, orgId: string, actorId: string, dto: CreateProjectDto) {
    await this.validateDepartment(tenantId, orgId, dto.departmentId);
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId, organizationId: orgId, deletedAt: null } });
      if (!client) throw new NotFoundException('Client not found');
    }
    const created = await this.createRow(tenantId, orgId, actorId, dto);
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'project', created.id, { event: 'PROJECT_CREATED', name: created.name, code: created.code });
    const [shaped] = await this.shapeProjects(tenantId, [created]);
    return shaped;
  }

  private async createRow(tenantId: string, orgId: string, actorId: string, dto: CreateProjectDto): Promise<ProjectWithRelations> {
    try {
      return await this.prisma.project.create({
        data: { tenantId, organizationId: orgId, ...dto, billable: dto.billable ?? true, createdBy: actorId, updatedBy: actorId },
        include: PROJECT_INCLUDE,
      });
    } catch (err: unknown) {
      handleP2002(err);
    }
  }

  async update(tenantId: string, orgId: string, id: string, actorId: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findFirst({ where: { id, tenantId, organizationId: orgId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Project not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    if (dto.departmentId) await this.validateDepartment(tenantId, orgId, dto.departmentId);
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId, organizationId: orgId, deletedAt: null } });
      if (!client) throw new NotFoundException('Client not found');
    }

    const { version, ...rest } = dto;
    const updated = await this.updateRow(id, actorId, rest);
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'project', id, { event: 'PROJECT_UPDATED', ...rest });
    const [shaped] = await this.shapeProjects(tenantId, [updated]);
    return shaped;
  }

  private async updateRow(id: string, actorId: string, rest: Omit<UpdateProjectDto, 'version'>): Promise<ProjectWithRelations> {
    try {
      return await this.prisma.project.update({
        where: { id },
        data: { ...rest, updatedBy: actorId, version: { increment: 1 } },
        include: PROJECT_INCLUDE,
      });
    } catch (err: unknown) {
      handleP2002(err);
    }
  }

  async remove(tenantId: string, orgId: string, id: string, actorId: string, version: number): Promise<void> {
    const existing = await this.prisma.project.findFirst({ where: { id, tenantId, organizationId: orgId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Project not found');
    if (existing.version !== version) throw new ConflictException('Version mismatch');
    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actorId, version: { increment: 1 } } });
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'project', id, { event: 'PROJECT_DELETED', name: existing.name, code: existing.code });
  }

  private async audit(tenantId: string, actorId: string, action: AuditAction, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action, entityType, entityId, metadata } });
  }
}

function handleP2002(err: unknown): never {
  const e = err as { code?: string };
  if (e?.code === 'P2002') throw new ConflictException('A project with this code already exists');
  throw err;
}
