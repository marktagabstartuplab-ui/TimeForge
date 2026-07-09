import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, ListQuery, PageResult } from '../../common/crud/crud.service';
import { CreateWorkCategoryDto, UpdateWorkCategoryDto } from './dto';
import { WorkCategory } from '@prisma/client';

@Injectable()
export class WorkCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, orgId: string, query: ListQuery): Promise<PageResult<WorkCategory>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};
    const nameWhere = query.q ? { name: { contains: String(query.q), mode: 'insensitive' as const } } : {};
    const items = await this.prisma.workCategory.findMany({
      where: { tenantId, organizationId: orgId, deletedAt: null, ...cursorWhere, ...nameWhere },
      orderBy: { name: 'asc' },
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  async findOne(tenantId: string, orgId: string, id: string): Promise<WorkCategory> {
    const item = await this.prisma.workCategory.findFirst({ where: { id, tenantId, organizationId: orgId, deletedAt: null } });
    if (!item) throw new NotFoundException('Work category not found');
    return item;
  }

  async create(tenantId: string, orgId: string, actorId: string, dto: CreateWorkCategoryDto): Promise<WorkCategory> {
    try {
      const created = await this.prisma.workCategory.create({
        data: { tenantId, organizationId: orgId, name: dto.name, createdBy: actorId, updatedBy: actorId },
      });
      await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'work_category', created.id, { event: 'WORK_CATEGORY_CREATED', name: created.name });
      return created;
    } catch (err: unknown) { handleP2002(err); }
  }

  async update(tenantId: string, orgId: string, id: string, actorId: string, dto: UpdateWorkCategoryDto): Promise<WorkCategory> {
    const existing = await this.findOne(tenantId, orgId, id);
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    const { version, ...rest } = dto;
    try {
      const updated = await this.prisma.workCategory.update({ where: { id }, data: { ...rest, updatedBy: actorId, version: { increment: 1 } } });
      await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'work_category', id, { event: 'WORK_CATEGORY_UPDATED', name: existing.name });
      return updated;
    } catch (err: unknown) { handleP2002(err); }
  }

  async remove(tenantId: string, orgId: string, id: string, actorId: string, version: number): Promise<void> {
    const existing = await this.findOne(tenantId, orgId, id);
    if (existing.version !== version) throw new ConflictException('Version mismatch');
    await this.prisma.workCategory.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actorId, version: { increment: 1 } } });
    await this.audit(tenantId, actorId, AuditAction.ADMIN_ACTION, 'work_category', id, { event: 'WORK_CATEGORY_DELETED', name: existing.name });
  }

  private async audit(tenantId: string, actorId: string, action: AuditAction, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action, entityType, entityId, metadata } });
  }
}

function handleP2002(err: unknown): never {
  const e = err as { code?: string };
  if (e?.code === 'P2002') throw new ConflictException('A work category with this name already exists');
  throw err;
}
