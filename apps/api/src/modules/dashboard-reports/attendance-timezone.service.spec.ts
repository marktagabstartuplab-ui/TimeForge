import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * Attendance joins TimeEntry.startTime (an instant) to Shift.shiftDate and
 * Holiday.date (date-only columns naming a *local* day). Keying the instant by
 * UTC put anything logged before local 08:00 on the previous day, which both
 * double-counted local days and hid lateness on early shifts.
 */
describe('DashboardService attendance — local day keying', () => {
  const principal = {
    userId: 'admin-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: ['*'],
    roles: ['ADMIN'],
  } as unknown as AuthPrincipal;

  const SHIFT_DATE = new Date('2026-07-29T00:00:00Z'); // names 2026-07-29 locally
  const SHIFT_0600_MANILA = new Date('2026-07-28T22:00:00Z');

  async function attendance(opts: {
    entries: Date[];
    timeZone: string;
    shiftStart?: Date;
  }) {
    const timeEntryFindMany = jest
      .fn()
      .mockResolvedValue(opts.entries.map((startTime) => ({ userId: 'user-1', startTime })));

    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-1', firstName: 'Ana', lastName: 'Cruz', department: null }]),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: timeEntryFindMany },
      shift: {
        findMany: jest.fn().mockResolvedValue(
          opts.shiftStart
            ? [{ userId: 'user-1', shiftDate: SHIFT_DATE, startTime: opts.shiftStart }]
            : [],
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
        {
          provide: OrgTimeZoneService,
          useValue: { forOrganization: jest.fn().mockResolvedValue(opts.timeZone) },
        },
      ],
    }).compile();

    const service = module.get(DashboardService) as unknown as {
      computeAttendanceRows: (
        t: string,
        u: AuthPrincipal,
        q: Record<string, string>,
      ) => Promise<{ rows: { daysLogged: number; absences: number; tardiness: number }[] }>;
    };
    const { rows } = await service.computeAttendanceRows('tenant-1', principal, {
      from: '2026-07-29',
      to: '2026-07-29',
    });
    return { row: rows[0], timeEntryFindMany };
  }

  it('counts one local work day when a shift straddles UTC midnight', async () => {
    // 07:00 and 10:00 Manila on 2026-07-29 — one day, two entries.
    const entries = [new Date('2026-07-28T23:00:00Z'), new Date('2026-07-29T02:00:00Z')];

    const { row } = await attendance({ entries, timeZone: 'Asia/Manila' });
    expect(row.daysLogged).toBe(1);

    // Under UTC the same shift spans 07-28 and 07-29 — two "days worked" from
    // one, inflating attendance and erasing an absence.
    const { row: utc } = await attendance({ entries, timeZone: 'UTC' });
    expect(utc.daysLogged).toBe(2);
  });

  it('flags lateness on an early shift that UTC keying missed', async () => {
    // Shift starts 06:00 Manila; the employee's first entry is 07:00 Manila.
    const entries = [new Date('2026-07-28T23:00:00Z')];

    const { row } = await attendance({
      entries,
      timeZone: 'Asia/Manila',
      shiftStart: SHIFT_0600_MANILA,
    });
    expect(row.tardiness).toBe(1);

    // Under UTC the entry keys to 07-28 while the shift keys to 07-29, so the
    // two never meet and the late arrival goes unreported.
    const { row: utc } = await attendance({
      entries,
      timeZone: 'UTC',
      shiftStart: SHIFT_0600_MANILA,
    });
    expect(utc.tardiness).toBe(0);
  });

  it('queries the entry window across the whole local day', async () => {
    const { timeEntryFindMany } = await attendance({
      entries: [new Date('2026-07-28T23:00:00Z')],
      timeZone: 'Asia/Manila',
    });

    const { startTime } = timeEntryFindMany.mock.calls[0][0].where;
    expect(startTime.gte).toEqual(new Date('2026-07-28T16:00:00Z'));
    expect(startTime.lt).toEqual(new Date('2026-07-29T16:00:00Z'));
  });
});
