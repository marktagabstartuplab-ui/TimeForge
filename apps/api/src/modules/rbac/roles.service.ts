import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { ALL_PERMISSIONS } from '@timeforge/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, ListQuery, PageResult } from '../../common/crud/crud.service';
import { CreateRoleDto, UpdateRoleDto } from './dto';

// ── Shape helpers ────────────────────────────────────────────────────────────

type RoleWithPerms = {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  isSystem: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  permissions: { permission: { key: string } }[];
};

function shapeRole(role: RoleWithPerms) {
  return {
    id: role.id,
    tenantId: role.tenantId,
    key: role.key,
    name: role.name,
    isSystem: role.isSystem,
    permissionKeys: role.permissions.map((rp) => rp.permission.key).sort(),
    version: role.version,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

const ROLE_INCLUDE = {
  permissions: { include: { permission: { select: { key: true } } } },
} as const;

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List all roles for the tenant (paginated). */
  async findAll(tenantId: string, query: ListQuery): Promise<PageResult<ReturnType<typeof shapeRole>>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};

    const items = await this.prisma.role.findMany({
      where: { tenantId, deletedAt: null, ...cursorWhere },
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
      take: limit + 1,
    });

    return buildPage(items.map(shapeRole), limit);
  }

  /** Fetch a single role by id (tenant-safe). */
  async findOne(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: ROLE_INCLUDE,
    });
    if (!role) throw new NotFoundException('Role not found');
    return shapeRole(role);
  }

  /**
   * Create a custom (non-system) role.
   * Derives key from name (UPPER_SNAKE_CASE). Audit: ROLE_CHANGE.
   */
  async create(tenantId: string, actorId: string, dto: CreateRoleDto) {
    const key = dto.name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    const permIds = await this.resolvePermissionIds(dto.permissionKeys);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: { tenantId, key, name: dto.name.trim(), isSystem: false },
        });

        if (permIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permIds.map((permissionId) => ({ roleId: created.id, permissionId })),
            skipDuplicates: true,
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            actorId,
            action: AuditAction.ROLE_CHANGE,
            entityType: 'role',
            entityId: created.id,
            metadata: { event: 'ROLE_CREATED', name: dto.name, permissionKeys: dto.permissionKeys },
          },
        });

        return shapeRole(
          await tx.role.findUniqueOrThrow({ where: { id: created.id }, include: ROLE_INCLUDE }),
        );
      });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') throw new ConflictException('A role with this name or key already exists in this tenant');
      throw err;
    }
  }

  /**
   * Rename a role and/or replace its full permission set atomically.
   * System roles: name + permissions can still be updated (only deletion is blocked).
   * Optimistic locking via `dto.version`. Audit: ROLE_CHANGE.
   */
  async update(tenantId: string, id: string, actorId: string, dto: UpdateRoleDto) {
    const existing = await this.prisma.role.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch — please refresh and retry');

    const permIds =
      dto.permissionKeys !== undefined ? await this.resolvePermissionIds(dto.permissionKeys) : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          version: { increment: 1 },
        },
      });

      if (permIds !== null) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permIds.map((permissionId) => ({ roleId: id, permissionId })),
            skipDuplicates: true,
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: AuditAction.ROLE_CHANGE,
          entityType: 'role',
          entityId: id,
          metadata: {
            event: 'ROLE_UPDATED',
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.permissionKeys !== undefined ? { permissionKeys: dto.permissionKeys } : {}),
          },
        },
      });

      return shapeRole(
        await tx.role.findUniqueOrThrow({ where: { id }, include: ROLE_INCLUDE }),
      );
    });
  }

  /**
   * Soft-delete a custom role.
   * System roles (`isSystem = true`) → 409 (Phase 4 §3).
   * Optimistic lock via query `version`. Audit: ROLE_CHANGE.
   */
  async remove(tenantId: string, id: string, actorId: string, version: number): Promise<void> {
    const existing = await this.prisma.role.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystem) throw new ConflictException('System roles cannot be deleted (Phase 4 §3)');
    if (existing.version !== version) throw new ConflictException('Version mismatch — please refresh and retry');

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: AuditAction.ROLE_CHANGE,
          entityType: 'role',
          entityId: id,
          metadata: { event: 'ROLE_DELETED', name: existing.name, key: existing.key },
        },
      });
    });
  }

  /**
   * Permission matrix for the "Role Permissions Overview" UI — grouped by
   * resource (the part of each permission key before the ':'), cross-referenced
   * against each real role's actual DB-assigned permissions. No fabricated
   * roles or features: whatever roles/permissions exist in this tenant.
   */
  async matrix(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    const roleShapes = roles.map(shapeRole);

    const grouped = new Map<string, string[]>();
    for (const key of ALL_PERMISSIONS) {
      const [resource] = key.split(':');
      const list = grouped.get(resource) ?? [];
      list.push(key);
      grouped.set(resource, list);
    }

    const resources = Array.from(grouped.entries()).map(([resource, keys]) => ({
      resource,
      label: resource.replace(/_/g, ' '),
      permissions: keys.map((key) => ({
        key,
        label: (key.split(':')[1] ?? key).replace(/_/g, ' '),
        roles: Object.fromEntries(roleShapes.map((r) => [r.id, r.permissionKeys.includes(key)])),
      })),
    }));

    return {
      roles: roleShapes.map((r) => ({ id: r.id, key: r.key, name: r.name, isSystem: r.isSystem })),
      resources,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Look up Permission.id for each key. Unknown keys are silently ignored (DTO
   *  validator already guaranteed they're valid catalog entries). */
  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    return perms.map((p) => p.id);
  }
}
