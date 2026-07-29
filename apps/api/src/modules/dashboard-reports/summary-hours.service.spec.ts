import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * The "Hours This Month" card summed Timesheet.totalMinutes under
 * `periodStart >= from AND periodEnd <= to`. That both ignored hours not yet
 * rolled into a timesheet and dropped the current in-progress period, so the
 * card read a small fraction of what the Timesheet module showed for the same
 * month. Hours now come from TimeEntry filtered on startTime, matching
 * GET /time-entries.
 */
describe('DashboardService.summary — hours match the Timesheet module', () => {
  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: ['dashboard:read_self'],
    roles: ['EMPLOYEE'],
  } as unknown as AuthPrincipal;

  const timesheetRollup = [
    // Deliberately tiny + stale: the old code reported this as the month total.
    { status: 'APPROVED', _count: { id: 1 }, _sum: { totalMinutes: 636 } },
  ];

  async function summarize(runningEntries: { startTime: Date; durationMinutes: number | null }[] = []) {
    const timeEntryAggregate = jest.fn().mockResolvedValue({ _sum: { durationMinutes: 15_146 } });
    const timeEntryFindMany = jest.fn().mockResolvedValue(runningEntries);
    const prisma = {
      timesheet: { groupBy: jest.fn().mockResolvedValue(timesheetRollup) },
      timeEntry: { aggregate: timeEntryAggregate, findMany: timeEntryFindMany },
      kpiProgress: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
        {
          provide: OrgTimeZoneService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') },
        },
      ],
    }).compile();

    const result = await module.get(DashboardService).summary('tenant-1', principal, {});
    return { result, timeEntryAggregate, timeEntryFindMany };
  }

  afterEach(() => jest.useRealTimers());

  it('sums TimeEntry rather than the Timesheet rollup', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T01:00:00Z'));

    const { result } = await summarize();
    expect(result.hours.totalMinutes).toBe(15_146); // 252h 26m, as the Timesheet page shows
    expect(result.hours.totalMinutes).not.toBe(636);
  });

  it('windows entries on startTime from the start of the org-local month', async () => {
    // 2026-07-29T09:00+08:00.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T01:00:00Z'));

    const { timeEntryAggregate } = await summarize();
    const { startTime } = timeEntryAggregate.mock.calls[0][0].where;
    // 2026-07-01 00:00 +08:00 — the calendar month, not a trailing N days.
    expect(startTime.gte).toEqual(new Date('2026-06-30T16:00:00Z'));
    expect(startTime.lte).toEqual(new Date('2026-07-29T01:00:00Z'));
  });

  it('counts elapsed time for a running timer, as the frontend does', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T01:00:00Z'));

    const { result } = await summarize([
      { startTime: new Date('2026-07-29T00:00:00Z'), durationMinutes: null },
    ]);
    expect(result.hours.totalMinutes).toBe(15_146 + 60);
  });

  it('still reports approved minutes from the timesheet rollup', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T01:00:00Z'));

    const { result } = await summarize();
    expect(result.hours.approvedMinutes).toBe(636);
    expect(result.timesheets.byStatus).toEqual({ APPROVED: 1 });
  });
});
