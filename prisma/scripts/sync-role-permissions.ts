/**
 * One-time reconciliation: grant any permission missing from a system role's
 * live RolePermission rows, compared against the intended ROLE_PERMISSIONS
 * catalog in packages/shared/src/permissions.ts.
 *
 * Additive only — never revokes. Only touches roles where isSystem = true and
 * whose key matches a built-in Role enum value, so custom roles created via
 * the role editor are untouched. Safe to re-run.
 *
 * Run with: npx tsx prisma/scripts/sync-role-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, Role } from '@timeforge/shared';

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permByKey = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));

  const systemRoleKeys = new Set<string>(Object.values(Role));
  const roles = await prisma.role.findMany({
    where: { isSystem: true, deletedAt: null },
    include: { permissions: true },
  });

  let totalGranted = 0;
  for (const role of roles) {
    if (!systemRoleKeys.has(role.key)) continue;

    const mapped = ROLE_PERMISSIONS[role.key as Role];
    const intendedKeys = mapped.includes('*') ? ALL_PERMISSIONS : mapped;
    const currentPermissionIds = new Set(role.permissions.map((rp) => rp.permissionId));

    const missing = intendedKeys
      .map((k) => permByKey.get(k))
      .filter((id): id is string => Boolean(id) && !currentPermissionIds.has(id!));

    if (missing.length === 0) {
      console.log(`[skip] ${role.key} (tenant ${role.tenantId}) — already up to date`);
      continue;
    }

    await prisma.rolePermission.createMany({
      data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    totalGranted += missing.length;
    console.log(`[fix]  ${role.key} (tenant ${role.tenantId}) — granted ${missing.length} missing permission(s)`);
  }

  console.log(`\nDone. ${totalGranted} permission grant(s) added across ${roles.length} system role row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
