import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@timeforge/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';

const CACHE_TTL_SECONDS = 300;

/**
 * Resolves a tenant's role keys into a flat permission set, sourced from the
 * `Role`/`RolePermission` tables — the same tables the custom-role editor
 * (RolesService) writes to. This makes editing a role's permissions take
 * effect on the role's very next request; no static map, no redeploy.
 *
 * Permission sets are cached per (tenant, role key) — RolesService invalidates
 * the cache entry immediately on create/update/delete, so the TTL below is
 * only a safety net, not the primary invalidation path.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async resolvePermissions(tenantId: string, roleKeys: string[]): Promise<string[]> {
    if (roleKeys.length === 0) return [];

    const set = new Set<string>();
    const uncached: string[] = [];

    for (const key of roleKeys) {
      const cached = await this.cache.get<string[]>(this.cacheKey(tenantId, key));
      if (cached) {
        cached.forEach((p) => set.add(p));
      } else {
        uncached.push(key);
      }
    }

    if (uncached.length > 0) {
      const roles = await this.prisma.role.findMany({
        // Explicit tenantId filter: this runs during JWT validation, before the
        // request-context tenant is set, so the Prisma auto-scoping middleware
        // (which reads that same context) cannot be relied on here.
        where: { tenantId, key: { in: uncached }, deletedAt: null },
        include: { permissions: { include: { permission: { select: { key: true } } } } },
      });
      for (const role of roles) {
        const keys = role.permissions.map((rp) => rp.permission.key);
        keys.forEach((p) => set.add(p));
        await this.cache.set(this.cacheKey(tenantId, role.key), keys, CACHE_TTL_SECONDS);
      }
    }

    // A role granted every known permission is functionally an admin role —
    // collapse to the '*' sentinel that every permission check in the app
    // already understands (guards, service-level checks, nav filtering).
    if (ALL_PERMISSIONS.every((p) => set.has(p))) return ['*'];
    return [...set];
  }

  /** Drops the cached permission set for one role so the next request
   *  re-reads it from the database. Call after any Role/RolePermission write. */
  async invalidateRole(tenantId: string, roleKey: string): Promise<void> {
    await this.cache.del(this.cacheKey(tenantId, roleKey));
  }

  private cacheKey(tenantId: string, roleKey: string): string {
    return `rbac:role:${tenantId}:${roleKey}`;
  }
}
