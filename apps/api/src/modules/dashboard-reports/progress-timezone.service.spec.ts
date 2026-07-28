import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * "Today's Progress" and the weekly total are windowed server-side. With UTC
 * boundaries both reset at 08:00 Manila rather than local midnight, so an
 * early-shift employee saw a stale day and, on Monday mornings, last week.
 */
describe('DashboardService.progress — local day and week windows', () => {
  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: ['*'],
    roles: ['EMPLOYEE'],
  } as unknown as AuthPrincipal;

  async function windows(timeZone: string) {
    const timeEntryFindMany = jest.fn().mockResolvedValue([]);
    const workSessionFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      timeEntry: { findMany: timeEntryFindMany },
      workSession: { findMany: workSessionFindMany },
      scrumTask: { findMany: jest.fn().mockResolvedValue([]) },
      kpiProgress: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue(timeZone) } },
      ],
    }).compile();

    const service = module.get(DashboardService);
    await service.progress('tenant-1', principal);

    return {
      today: timeEntryFindMany.mock.calls[0][0].where.startTime.gte as Date,
      week: timeEntryFindMany.mock.calls[1][0].where.startTime.gte as Date,
      workDate: workSessionFindMany.mock.calls[0][0].where.workDate.gte as Date,
    };
  }

  afterEach(() => jest.useRealTimers());

  it('starts "today" at local midnight, not 08:00 local', async () => {
    // 2026-07-29T09:00+08:00.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T01:00:00Z'));

    const { today } = await windows('Asia/Manila');
    expect(today).toEqual(new Date('2026-07-28T16:00:00Z')); // 2026-07-29 00:00 +08:00
  });

  it('matches workDate against the local day value, not the instant', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T01:00:00Z'));

    const { workDate } = await windows('Asia/Manila');
    // workDate is date-only: today's session row is stored as 2026-07-29T00:00Z.
    expect(workDate).toEqual(new Date('2026-07-29T00:00:00Z'));
  });

  it('starts the week on the local Monday', async () => {
    // Monday 2026-07-27T00:30+08:00 — Sunday 07-26 in UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-26T16:30:00Z'));

    const { week } = await windows('Asia/Manila');
    expect(week).toEqual(new Date('2026-07-26T16:00:00Z')); // this week's Monday

    // Under UTC the same instant is Sunday, so the window reached back to the
    // previous Monday and counted a whole extra week of hours.
    const { week: utcWeek } = await windows('UTC');
    expect(utcWeek).toEqual(new Date('2026-07-20T00:00:00Z'));
  });
});
