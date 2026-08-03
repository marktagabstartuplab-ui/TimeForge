/**
 * Additive backfill for the bug-tracking permission keys (FEAT-1).
 *
 * Deliberately NOT scripts/reset-role-permissions.ts: that one deletes every
 * RolePermission row for a role and rebuilds it from ROLE_PERMISSIONS, which
 * discards any custom permission set an admin saved through RolesService.update
 * (system roles allow permission edits — only deletion is blocked). On a
 * deployment with real users that is a destructive reset.
 *
 * This script only ever inserts: it adds the `bug:*` permission rows and grants
 * them to the roles that ROLE_PERMISSIONS says should hold them, leaving every
 * pre-existing mapping untouched. Idempotent — safe to re-run.
 *
 * Run with the privileged DIRECT_URL connection, same as prisma/seed.ts:
 *   npm run db:grant-bug-permissions
 */
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, Role } from '@timeforge/shared';

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

const BUG_PERMISSIONS = ALL_PERMISSIONS.filter((k) => k.startsWith('bug:'));

async function main() {
  if (BUG_PERMISSIONS.length === 0) {
    throw new Error('No bug:* keys in the shared permission catalog — nothing to backfill.');
  }
  console.log(`Backfilling ${BUG_PERMISSIONS.length} permissions: ${BUG_PERMISSIONS.join(', ')}\n`);

  for (const key of BUG_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permByKey = new Map(
    (await prisma.permission.findMany({ where: { key: { in: BUG_PERMISSIONS } } })).map((p) => [p.key, p.id]),
  );

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  let granted = 0;

  for (const tenant of tenants) {
    for (const roleKey of Object.values(Role)) {
      const role = await prisma.role.findFirst({
        where: { tenantId: tenant.id, key: roleKey, deletedAt: null },
      });
      // Never create a role — only extend one that already exists.
      if (!role) continue;

      const mapped = ROLE_PERMISSIONS[roleKey];
      // ADMIN holds '*', which the seeder materializes as every concrete key.
      const grantKeys = mapped.includes('*')
        ? BUG_PERMISSIONS
        : mapped.filter((k) => k.startsWith('bug:'));
      if (grantKeys.length === 0) {
        console.log(`  ${tenant.slug}/${roleKey}: no bug permissions in the matrix, skipped`);
        continue;
      }

      const { count } = await prisma.rolePermission.createMany({
        data: grantKeys.map((k) => ({ roleId: role.id, permissionId: permByKey.get(k)! })),
        skipDuplicates: true,
      });
      granted += count;
      console.log(`  ${tenant.slug}/${roleKey}: +${count} new of ${grantKeys.length} (${grantKeys.join(', ')})`);
    }
  }

  console.log(`\n✓ Inserted ${granted} role-permission grant(s). No existing grants were modified.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
