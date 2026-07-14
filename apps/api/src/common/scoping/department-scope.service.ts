import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthPrincipal } from '../decorators';

/**
 * Resolves the department-based supervision scope for a principal.
 *
 * A supervisor governs the department(s) they are the head of — i.e. every
 * `Department` whose `managerId` points at them (set by an admin via "Assign
 * Department Supervisor"). Their visible/actionable users are every member of
 * those departments (`User.departmentId IN managedDepartments`), plus
 * themselves.
 *
 * This replaces the previous `supervisorId == me` (direct-report) model. It is
 * the single source of truth for supervisor scoping across all `*:read_team`
 * features — every service delegates here so the isolation rule lives in one
 * place. Always tenant/org scoped and soft-delete aware.
 */
@Injectable()
export class DepartmentScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids of the departments this principal heads (Department.managerId == me). */
  async managedDepartmentIds(p: AuthPrincipal): Promise<string[]> {
    const departments = await this.prisma.department.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        managerId: p.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return departments.map((d) => d.id);
  }

  /**
   * User ids a supervisor may see/act on: every member of the departments they
   * head, plus themselves. Returns just `[me]` when they head no department.
   */
  async teamUserIds(p: AuthPrincipal): Promise<string[]> {
    const departmentIds = await this.managedDepartmentIds(p);
    if (departmentIds.length === 0) return [p.userId];

    const members = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        departmentId: { in: departmentIds },
        deletedAt: null,
      },
      select: { id: true },
    });
    return [...new Set([p.userId, ...members.map((m) => m.id)])];
  }

  /** True when `userId` is within this principal's department scope. */
  async canAccessUser(p: AuthPrincipal, userId: string): Promise<boolean> {
    if (userId === p.userId) return true;
    return (await this.teamUserIds(p)).includes(userId);
  }
}
