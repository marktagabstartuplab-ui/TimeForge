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

  const org = await prisma.organization.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'demo-org' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Demo Organization', slug: 'demo-org', timezone: 'Asia/Manila' },
  });

  // ── Permission catalog ─────────────────────────────────────────────────────
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permByKey = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));

  // ── Roles + role→permission mapping ────────────────────────────────────────
  for (const roleKey of Object.values(Role)) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: roleKey } },
      update: {},
      create: { tenantId: tenant.id, key: roleKey, name: roleKey, isSystem: true },
    });
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
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: {},
      create: {
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
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { tenantId_key: { tenantId: tenant.id, key: roleKey } },
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
    await prisma.organizationSetting.upsert({
      where: { tenantId_organizationId_key: { tenantId: tenant.id, organizationId: org.id, key: s.key } },
      update: { value: s.value as object, type: s.type },
      create: { tenantId: tenant.id, organizationId: org.id, key: s.key, value: s.value as object, type: s.type },
    });
  }

  // ── Phase 6: Demo org structure ────────────────────────────────────────────

  // Department
  const engineeringDept = await prisma.department.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'Engineering' } },
    update: {},
    create: { tenantId: tenant.id, organizationId: org.id, name: 'Engineering', createdBy: admin.id, updatedBy: admin.id },
  });
  await prisma.department.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'Human Resources' } },
    update: {},
    create: { tenantId: tenant.id, organizationId: org.id, name: 'Human Resources', createdBy: admin.id, updatedBy: admin.id },
  });

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
  const backendTeam = await prisma.team.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'Backend' } },
    update: {},
    create: {
      tenantId: tenant.id,
      organizationId: org.id,
      name: 'Backend',
      departmentId: engineeringDept.id,
      supervisorId: supervisor.id,
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });

  // Client
  const acmeClient = await prisma.client.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'ACME Corporation' } },
    update: {},
    create: {
      tenantId: tenant.id,
      organizationId: org.id,
      name: 'ACME Corporation',
      contact: 'contact@acme.example.com',
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });

  // Project
  await prisma.project.upsert({
    where: { tenantId_organizationId_code: { tenantId: tenant.id, organizationId: org.id, code: 'TF-2026' } },
    update: {},
    create: {
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

  // Work Category
  await prisma.workCategory.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'Development' } },
    update: {},
    create: { tenantId: tenant.id, organizationId: org.id, name: 'Development', createdBy: admin.id, updatedBy: admin.id },
  });
  await prisma.workCategory.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'Meetings' } },
    update: {},
    create: { tenantId: tenant.id, organizationId: org.id, name: 'Meetings', createdBy: admin.id, updatedBy: admin.id },
  });
  await prisma.workCategory.upsert({
    where: { tenantId_organizationId_name: { tenantId: tenant.id, organizationId: org.id, name: 'Code Review' } },
    update: {},
    create: { tenantId: tenant.id, organizationId: org.id, name: 'Code Review', createdBy: admin.id, updatedBy: admin.id },
  });

  // Holiday
  const currentYear = new Date().getFullYear();
  const holidays = [
    { name: "New Year's Day", date: new Date(`${currentYear}-01-01`), recurring: true },
    { name: 'Labor Day', date: new Date(`${currentYear}-05-01`), recurring: true },
    { name: 'Christmas Day', date: new Date(`${currentYear}-12-25`), recurring: true },
  ];
  for (const h of holidays) {
    try {
      await prisma.holiday.upsert({
        where: { tenantId_organizationId_date_name: { tenantId: tenant.id, organizationId: org.id, date: h.date, name: h.name } },
        update: {},
        create: { tenantId: tenant.id, organizationId: org.id, name: h.name, date: h.date, recurring: h.recurring, createdBy: admin.id, updatedBy: admin.id },
      });
    } catch {
      // silently skip if holiday already exists with different constraint
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
