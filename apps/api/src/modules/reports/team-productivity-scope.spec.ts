import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OvertimeRateService } from '../../common/payroll/overtime-rate.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * BUG-BZ — the Team Productivity report came back empty for Admin and HR.
 *
 * Both endpoints scoped employees to `departmentId IN (departments I manage)`.
 * A supervisor heads a department so it worked for them; an Admin or HR user
 * heads none, so the list was empty, no timesheets matched, and the report
 * rendered "No active productivity records" with zeroed cards over a period
 * that had approved timesheets. These pin the scope each role actually gets.
 */
describe('ReportsService — Team Productivity scoping', () => {
  let service: ReportsService;
  let prisma: any;

  const principal = (over: Partial<AuthPrincipal>): AuthPrincipal =>
    ({
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      roles: [],
      permissions: [],
      ...over,
    }) as AuthPrincipal;

  /** @param managed departments the principal heads. */
  const build = async (managed: string[]) => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        // validateScope() looks the caller up to pin a supervisor to their own
        // department; managed[0] keeps that consistent with what they head.
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1', departmentId: managed[0] ?? null }),
      },
      timesheet: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn() } },
        {
          provide: DepartmentScopeService,
          useValue: { managedDepartmentIds: jest.fn().mockResolvedValue(managed) },
        },
        { provide: OvertimeRateService, useValue: {} },
        { provide: getQueueToken('reports-export'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(ReportsService);
    return prisma;
  };

  /** The `where` the employee lookup ran with. */
  const userWhere = () => prisma.user.findMany.mock.calls[0][0].where;

  it('covers the whole organization for an admin, who heads no department', async () => {
    await build([]);

    await service.getTeamProductivity(principal({ permissions: ['*'], roles: ['ADMIN'] }), {});

    // The regression: this used to be `departmentId: { in: [] }` — matching nobody.
    expect(userWhere().departmentId).toBeUndefined();
    expect(userWhere()).toEqual(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1', status: 'ACTIVE' }),
    );
  });

  it('covers the whole organization for HR', async () => {
    await build([]);

    await service.getTeamProductivity(
      principal({ permissions: ['dashboard:read_org'], roles: ['HR'] }),
      {},
    );

    expect(userWhere().departmentId).toBeUndefined();
  });

  it('still confines a supervisor to the departments they head', async () => {
    await build(['dept-a', 'dept-b']);

    await service.getTeamProductivity(
      principal({ permissions: ['dashboard:read_team'], roles: ['SUPERVISOR'] }),
      {},
    );

    expect(userWhere().departmentId).toEqual({ in: ['dept-a', 'dept-b'] });
  });

  it('lets an org reader narrow to one department', async () => {
    await build([]);

    await service.getTeamProductivity(principal({ permissions: ['*'], roles: ['ADMIN'] }), {
      departmentId: 'dept-c',
    });

    expect(userWhere().departmentId).toBe('dept-c');
  });

  // The department filter must not become a way to read outside your scope.
  // validateScope() is the gate, and it refuses before any query is built.
  it('refuses a supervisor asking for a department that is not theirs', async () => {
    await build(['dept-a']);

    await expect(
      service.getTeamProductivity(
        principal({ permissions: ['dashboard:read_team'], roles: ['SUPERVISOR'] }),
        { departmentId: 'dept-z' },
      ),
    ).rejects.toThrow('Supervisors can only generate reports');
  });

  // Regression guard: validateScope() overwrites query.departmentId with the
  // supervisor's own department, so narrowing on that field would have emptied
  // the report for the one role it previously worked for.
  it('keeps a supervisor on their managed departments despite the injected filter', async () => {
    await build(['dept-a']);

    await service.getTeamProductivity(
      principal({ permissions: ['dashboard:read_team'], roles: ['SUPERVISOR'] }),
      {},
    );

    expect(userWhere().departmentId).toEqual({ in: ['dept-a'] });
  });

  it('applies the same scope to the summary cards', async () => {
    await build([]);

    await service.getTeamProductivitySummary(
      principal({ permissions: ['*'], roles: ['ADMIN'] }),
      {},
    );

    expect(userWhere().departmentId).toBeUndefined();
  });
});
