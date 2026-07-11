/**
 * Seed: roles, permission catalog, role→permission mapping, a demo tenant +
 * organization, default settings, and demo users (admin, employee, intern,
 * supervisor, HR, finance). Phase 6 adds: demo department, team, client,
 * project, and work category.
 *
 * Runs with the privileged DIRECT_URL connection (owner/superuser bypasses RLS).
 */
import { PrismaClient, EmploymentType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, Role } from '@timeforge/shared';

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  // ── Tenant + Organization ────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo Corp', slug: 'demo' },
  });

  // Uniqueness on (tenantId, slug) is a partial index (WHERE deleted_at IS NULL),
  // which Prisma can't target with .upsert() — find-then-create instead, matching
  // apps/api/src/modules/organization/organization.service.ts.
  const org =
    (await prisma.organization.findFirst({ where: { tenantId: tenant.id, slug: 'demo-org', deletedAt: null } })) ??
    (await prisma.organization.create({
      data: { tenantId: tenant.id, name: 'Demo Organization', slug: 'demo-org', timezone: 'Asia/Manila' },
    }));

  // ── Permission catalog ─────────────────────────────────────────────────────
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permByKey = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));

  // ── Roles + role→permission mapping ────────────────────────────────────────
  for (const roleKey of Object.values(Role)) {
    // Uniqueness on (tenantId, key) is a partial index — see the organization
    // upsert above for why this can't be a native .upsert().
    const role =
      (await prisma.role.findFirst({ where: { tenantId: tenant.id, key: roleKey, deletedAt: null } })) ??
      (await prisma.role.create({ data: { tenantId: tenant.id, key: roleKey, name: roleKey, isSystem: true } }));
    const mapped = ROLE_PERMISSIONS[roleKey];
    const grantKeys = mapped.includes('*') ? ALL_PERMISSIONS : mapped;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantKeys.map((k) => ({ roleId: role.id, permissionId: permByKey.get(k)! })),
      skipDuplicates: true,
    });
  }

  // ── Demo users ─────────────────────────────────────────────────────────────
  const passwordHash = await argon2.hash('ChangeMe123!');

  async function ensureUser(
    email: string,
    firstName: string,
    lastName: string,
    roleKey: Role,
    employmentType: EmploymentType,
    payrollEligible: boolean,
  ) {
    // Uniqueness on (tenantId, email) is a partial index — find-then-create, as above.
    const user =
      (await prisma.user.findFirst({ where: { tenantId: tenant.id, email, deletedAt: null } })) ??
      (await prisma.user.create({
        data: {
          tenantId: tenant.id,
          organizationId: org.id,
          email,
          firstName,
          lastName,
          passwordHash,
          status: UserStatus.ACTIVE,
          isApproved: true,
          employmentType,
          payrollEligible,
          emailVerifiedAt: new Date(),
          hourlyRate: employmentType === EmploymentType.INTERN ? null : '25.00',
        },
      }));
    // tenantId_key isn't a real Prisma unique either (same partial-index reason).
    const role = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenant.id, key: roleKey, deletedAt: null },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    return user;
  }

  const admin = await ensureUser('admin@demo.test', 'Ada', 'Admin', Role.ADMIN, EmploymentType.FULL_TIME, true);
  await ensureUser('employee@demo.test', 'Eli', 'Employee', Role.EMPLOYEE, EmploymentType.EMPLOYEE, true);
  await ensureUser('intern@demo.test', 'Ivy', 'Intern', Role.EMPLOYEE, EmploymentType.INTERN, false);
  const supervisor = await ensureUser('supervisor@demo.test', 'Sam', 'Supervisor', Role.SUPERVISOR, EmploymentType.FULL_TIME, true);
  await ensureUser('hr@demo.test', 'Hana', 'HumanResources', Role.HR, EmploymentType.FULL_TIME, true);
  await ensureUser('finance@demo.test', 'Finn', 'Finance', Role.FINANCE, EmploymentType.FULL_TIME, true);

  // ── Organization settings (centralized config) ─────────────────────────────
  const settings: { key: string; value: unknown; type: string }[] = [
    { key: 'timezone', value: 'Asia/Manila', type: 'scalar' },
    {
      key: 'payroll.periods',
      value: [
        { type: 'FIRST_HALF', from: 1, to: 15 },
        { type: 'SECOND_HALF', from: 16, to: 31 },
      ],
      type: 'json',
    },
    { key: 'payroll.overtime', value: { dailyThresholdHours: 8 }, type: 'json' },
    { key: 'schedule.workweek', value: ['MON', 'TUE', 'WED', 'THU', 'FRI'], type: 'json' },
    { key: 'ai.provider', value: 'OPENAI', type: 'scalar' },
    {
      key: 'ai.toggles',
      value: {
        DAILY_SUMMARY: true,
        WEEKLY_SUMMARY: true,
        TIMESHEET_SUMMARY: true,
        BLOCKER_DETECTION: true,
        PRODUCTIVITY_INSIGHT: true,
        SUPERVISOR_ADVISORY: true,
        KPI_ANALYSIS: true,
        PAYROLL_VALIDATION: true,
      },
      type: 'json',
    },
  ];
  for (const s of settings) {
    // Uniqueness on (tenantId, organizationId, key) is a partial index — see
    // apps/api/src/modules/organization/organization.service.ts for the same pattern.
    const existingSetting = await prisma.organizationSetting.findFirst({
      where: { tenantId: tenant.id, organizationId: org.id, key: s.key, deletedAt: null },
    });
    if (existingSetting) {
      await prisma.organizationSetting.update({
        where: { id: existingSetting.id },
        data: { value: s.value as object, type: s.type },
      });
    } else {
      await prisma.organizationSetting.create({
        data: { tenantId: tenant.id, organizationId: org.id, key: s.key, value: s.value as object, type: s.type },
      });
    }
  }

  // ── Phase 6: Demo org structure ────────────────────────────────────────────

  // Department — uniqueness on (tenantId, organizationId, name) is a partial index,
  // same find-then-create pattern as above throughout the rest of this file.
  const engineeringDept =
    (await prisma.department.findFirst({ where: { tenantId: tenant.id, organizationId: org.id, name: 'Engineering', deletedAt: null } })) ??
    (await prisma.department.create({
      data: { tenantId: tenant.id, organizationId: org.id, name: 'Engineering', createdBy: admin.id, updatedBy: admin.id },
    }));
  if (!(await prisma.department.findFirst({ where: { tenantId: tenant.id, organizationId: org.id, name: 'Human Resources', deletedAt: null } }))) {
    await prisma.department.create({
      data: { tenantId: tenant.id, organizationId: org.id, name: 'Human Resources', createdBy: admin.id, updatedBy: admin.id },
    });
  }

  // Assign demo staff to Engineering so profile-driven fields (e.g. the
  // Daily Scrum "Department" auto-fill) have data out of the box.
  await prisma.user.updateMany({
    where: {
      tenantId: tenant.id,
      email: { in: ['employee@demo.test', 'intern@demo.test', 'supervisor@demo.test'] },
      departmentId: null,
    },
    data: { departmentId: engineeringDept.id },
  });

  // Team
  const backendTeam =
    (await prisma.team.findFirst({ where: { tenantId: tenant.id, organizationId: org.id, name: 'Backend', deletedAt: null } })) ??
    (await prisma.team.create({
      data: {
        tenantId: tenant.id,
        organizationId: org.id,
        name: 'Backend',
        departmentId: engineeringDept.id,
        supervisorId: supervisor.id,
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    }));

  // Client
  const acmeClient =
    (await prisma.client.findFirst({ where: { tenantId: tenant.id, organizationId: org.id, name: 'ACME Corporation', deletedAt: null } })) ??
    (await prisma.client.create({
      data: {
        tenantId: tenant.id,
        organizationId: org.id,
        name: 'ACME Corporation',
        contact: 'contact@acme.example.com',
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    }));

  // Project
  if (!(await prisma.project.findFirst({ where: { tenantId: tenant.id, organizationId: org.id, code: 'TF-2026', deletedAt: null } }))) {
    await prisma.project.create({
      data: {
        tenantId: tenant.id,
        organizationId: org.id,
        name: 'TimeForge Platform',
        code: 'TF-2026',
        clientId: acmeClient.id,
        billable: true,
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    });
  }

  // Work Category
  for (const name of ['Development', 'Meetings', 'Code Review']) {
    if (!(await prisma.workCategory.findFirst({ where: { tenantId: tenant.id, organizationId: org.id, name, deletedAt: null } }))) {
      await prisma.workCategory.create({
        data: { tenantId: tenant.id, organizationId: org.id, name, createdBy: admin.id, updatedBy: admin.id },
      });
    }
  }

  // Holiday
  const currentYear = new Date().getFullYear();
  const holidays = [
    { name: "New Year's Day", date: new Date(`${currentYear}-01-01`), recurring: true },
    { name: 'Labor Day', date: new Date(`${currentYear}-05-01`), recurring: true },
    { name: 'Christmas Day', date: new Date(`${currentYear}-12-25`), recurring: true },
  ];
  for (const h of holidays) {
    const existing = await prisma.holiday.findFirst({
      where: { tenantId: tenant.id, organizationId: org.id, date: h.date, name: h.name, deletedAt: null },
    });
    if (!existing) {
      await prisma.holiday.create({
        data: { tenantId: tenant.id, organizationId: org.id, name: h.name, date: h.date, recurring: h.recurring, createdBy: admin.id, updatedBy: admin.id },
      });
    }
  }

  console.log('✓ Seed complete (Phase 6).');
  console.log('  Tenant: demo   Org: demo-org (Asia/Manila)');
  console.log('  Login:  admin@demo.test / ChangeMe123!  (also employee@, intern@, supervisor@, hr@, finance@)');
  console.log('  Dept: Engineering | Team: Backend | Client: ACME | Project: TF-2026 | 3 Work Categories | 3 Holidays');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
