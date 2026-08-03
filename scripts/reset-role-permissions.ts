/**
 * ⚠️ DESTRUCTIVE — this REPLACES role permissions. It is not a sync.
 *
 * For every tenant and every system role, this deletes all RolePermission rows
 * and rebuilds them from packages/shared's ROLE_PERMISSIONS. Two consequences
 * on a deployment with real users:
 *
 *   1. Any custom permission set an admin saved through RolesService.update is
 *      discarded (system roles allow permission edits — only deletion is
 *      blocked). There is no record of what was lost.
 *   2. The delete and the re-insert are not in one transaction, so a role holds
 *      ZERO permissions for a moment. Concurrent requests 403 during that window.
 *
 * Use this only for a deliberate, full reset back to the code-defined baseline —
 * e.g. reverting an environment whose roles were edited into an unknown state.
 *
 * To grant permissions added in code WITHOUT revoking anything, which is what
 * a normal deploy needs, use the additive script instead:
 *
 *     npm run db:sync-permissions      (prisma/scripts/sync-role-permissions.ts)
 *
 * Renamed from sync-role-permissions.ts: it sat next to an additive script of
 * the same name, and `npm run db:sync-permissions` pointed here — so the routine
 * deploy step was silently the destructive one.
 *
 * Run with the privileged DIRECT_URL connection, same as prisma/seed.ts:
 *
 *     npx tsx scripts/reset-role-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, Role } from '@timeforge/shared';

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  // Permission catalog must exist before any RolePermission can reference it.
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permByKey = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  let rolesSynced = 0;

  for (const tenant of tenants) {
    for (const roleKey of Object.values(Role)) {
      const role = await prisma.role.findFirst({
        where: { tenantId: tenant.id, key: roleKey, deletedAt: null },
      });
      // Only sync roles that already exist for this tenant — this script never
      // creates a role, just corrects what an existing one can do.
      if (!role) continue;

      const mapped = ROLE_PERMISSIONS[roleKey];
      const grantKeys = mapped.includes('*') ? ALL_PERMISSIONS : mapped;

      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: grantKeys.map((k) => ({ roleId: role.id, permissionId: permByKey.get(k)! })),
        skipDuplicates: true,
      });
      rolesSynced++;
      console.log(`  synced ${tenant.slug}/${roleKey}: ${grantKeys.length} permissions`);
    }
  }

  console.log(`\n✓ Synced ${rolesSynced} role(s) across ${tenants.length} tenant(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
