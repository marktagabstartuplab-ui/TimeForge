import { Test, TestingModule } from '@nestjs/testing';
import { TimesheetsService } from './timesheets.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { StorageService } from '../storage/storage.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/** One 10-hour Manila shift on 2026-07-29: 06:00–16:00 +08:00. */
const SHIFT_ENTRIES = [
  { timesheetId: 'ts-1', startTime: new Date('2026-07-28T22:00:00Z'), durationMinutes: 120, endTime: new Date('2026-07-29T00:00:00Z') },
  { timesheetId: 'ts-1', startTime: new Date('2026-07-29T00:00:00Z'), durationMinutes: 480, endTime: new Date('2026-07-29T08:00:00Z') },
];

const principal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  permissions: ['*'],
  roles: ['ADMIN'],
} as unknown as AuthPrincipal;

async function buildService(timeZone: string, prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    timesheet: { findMany: jest.fn().mockResolvedValue([]) },
    timeEntry: { findMany: jest.fn().mockResolvedValue(SHIFT_ENTRIES) },
    workSession: { findMany: jest.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TimesheetsService,
      { provide: PrismaService, useValue: prisma },
      { provide: NotificationsService, useValue: {} },
      { provide: ApprovalsService, useValue: {} },
      { provide: DepartmentScopeService, useValue: {} },
      { provide: StorageService, useValue: { signedUrlsByKey: jest.fn().mockResolvedValue({}) } },
      { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue(timeZone) } },
    ],
  }).compile();

  return { service: module.get(TimesheetsService), prisma };
}

describe('TimesheetsService — overtime rollup uses local days', () => {
  async function overtimeFor(timeZone: string) {
    const { service } = await buildService(timeZone, {
      timesheet: { findMany: jest.fn().mockResolvedValue([]) }, // no explicit overrides
    });
    const compute = (service as unknown as {
      computeOvertimeMinutesByTimesheet: (p: AuthPrincipal, ids: string[]) => Promise<Map<string, number>>;
    }).computeOvertimeMinutesByTimesheet.bind(service);

    const result = await compute(principal, ['ts-1']);
    return result.get('ts-1') ?? 0;
  }

  it('counts the 2 hours past 8h on a single local day', async () => {
    expect(await overtimeFor('Asia/Manila')).toBe(120);
  });

  it('regression: UTC split the shift into 2h + 8h and found no overtime', async () => {
    expect(await overtimeFor('UTC')).toBe(0);
  });
});

describe('TimesheetsService.history — one row per local day', () => {
  it('groups a shift that straddles UTC midnight into a single day', async () => {
    const { service, prisma } = await buildService('Asia/Manila');

    const rows = await service.history(principal, { range: 'custom', from: '2026-07-29', to: '2026-07-29' } as never);

    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-07-29');
    expect(rows[0].workMinutes).toBe(600);

    // The entry window covers the whole local day, not UTC midnight to midnight.
    const { startTime } = (prisma.timeEntry.findMany as jest.Mock).mock.calls[0][0].where;
    expect(startTime.gte).toEqual(new Date('2026-07-28T16:00:00Z'));
    expect(startTime.lt).toEqual(new Date('2026-07-29T16:00:00Z'));
  });

  it('regression: UTC grouping reported the same shift as two part-days', async () => {
    const { service } = await buildService('UTC');

    const rows = await service.history(principal, { range: 'custom', from: '2026-07-29', to: '2026-07-29' } as never);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.workMinutes).sort()).toEqual([120, 480]);
  });
});
