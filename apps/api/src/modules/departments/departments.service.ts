import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, ListQuery, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';

const DEPARTMENT_INCLUDE = {
  manager: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { users: true, projects: true } },
} satisfies Prisma.DepartmentInclude;

type DepartmentWithRelations = Prisma.DepartmentGetPayload<{ include: typeof DEPARTMENT_INCLUDE }>;

function shapeDepartment(dept: DepartmentWithRelations) {
  const { _count, ...rest } = dept;
  return { ...rest, staffCount: _count.users, projectCount: _count.projects };
}

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, orgId: string, query: ListQuery): Promise<PageResult<ReturnType<typeof shapeDepartment>>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};
    const nameWhere = query.q ? { name: { contains: String(query.q), mode: 'insensitive' as const } } : {};
    const items = await this.prisma.department.findMany({
      where: { tenantId, organizationId: orgId, deletedAt: null, ...cursorWhere, ...nameWhere },
      include: DEPARTMENT_INCLUDE,
      orderBy: { name: 'asc' },
      take: limit + 1,
    });
    const page = buildPage(items, limit);
    return { data: page.data.map(shapeDepartment), page: page.page };
  }

  async findOne(tenantId: string, orgId: string, id: string) {
    const item = await this.prisma.department.findFirst({
      where: { id, tenantId, organizationId: orgId, deletedAt: null },
      include: DEPARTMENT_INCLUDE,
    });
    if (!item) throw new NotFoundException('Department not found');
    return shapeDepartment(item);
  }

  private async validateManager(tenantId: string, orgId: string, managerId: string): Promise<void> {
    const manager = await this.prisma.user.findFirst({
      where: { id: managerId, tenantId, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!manager) throw new NotFoundException('Manager not found in this organization');
  }

  async create(tenantId: string, orgId: string, actorId: string, dto: CreateDepartmentDto) {
    if (dto.managerId) await this.validateManager(tenantId, orgId, dto.managerId);
    const created = await this.createRow(tenantId, orgId, actorId, dto);
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'department', created.id, { event: 'DEPARTMENT_CREATED', name: created.name });
    return shapeDepartment(created);
  }

  private async createRow(tenantId: string, orgId: string, actorId: string, dto: CreateDepartmentDto): Promise<DepartmentWithRelations> {
    try {
      return await this.prisma.department.create({
        data: { tenantId, organizationId: orgId, name: dto.name, managerId: dto.managerId ?? null, createdBy: actorId, updatedBy: actorId },
        include: DEPARTMENT_INCLUDE,
      });
    } catch (err: unknown) {
      handleP2002(err);
    }
  }

  /** Admin/HR (department:update) can edit any department; Supervisor (department:update_own)
   *  may only edit the department(s) where they are the assigned manager. */
  private assertUpdateScope(caller: AuthPrincipal, existingManagerId: string | null): void {
    if (caller.permissions.includes('*') || caller.permissions.includes('department:update')) return;
    if (caller.permissions.includes('department:update_own') && existingManagerId === caller.userId) return;
    throw new ForbiddenException('You do not have permission to manage this department');
  }

  async update(caller: AuthPrincipal, id: string, dto: UpdateDepartmentDto) {
    const existing = await this.prisma.department.findFirst({
      where: { id, tenantId: caller.tenantId, organizationId: caller.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Department not found');
    this.assertUpdateScope(caller, existing.managerId);
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    if (dto.managerId) await this.validateManager(caller.tenantId, caller.organizationId, dto.managerId);

    const { version, ...rest } = dto;
    const updated = await this.updateRow(id, caller.userId, rest);
    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'department', id, { event: 'DEPARTMENT_UPDATED', ...rest });
    return shapeDepartment(updated);
  }

  private async updateRow(id: string, actorId: string, rest: { name?: string; managerId?: string | null }): Promise<DepartmentWithRelations> {
    try {
      return await this.prisma.department.update({
        where: { id },
        data: { ...rest, updatedBy: actorId, version: { increment: 1 } },
        include: DEPARTMENT_INCLUDE,
      });
    } catch (err: unknown) {
      handleP2002(err);
    }
  }

  async remove(tenantId: string, orgId: string, id: string, actorId: string, version: number): Promise<void> {
    const existing = await this.prisma.department.findFirst({ where: { id, tenantId, organizationId: orgId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Department not found');
    if (existing.version !== version) throw new ConflictException('Version mismatch');
    await this.prisma.department.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actorId, version: { increment: 1 } } });
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'department', id, { event: 'DEPARTMENT_DELETED', name: existing.name });
  }

  private async audit(tenantId: string, actorId: string, action: AuditAction, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action, entityType, entityId, metadata } });
  }
}

function handleP2002(err: unknown): never {
  const e = err as { code?: string };
  if (e?.code === 'P2002') throw new ConflictException('A department with this name already exists');
  throw err;
}
