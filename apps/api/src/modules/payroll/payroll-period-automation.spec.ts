import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../../infra/cache.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { OvertimeRateService } from '../../common/payroll/overtime-rate.service';
import { AuthPrincipal } from '../../common/decorators';
import { BirTaxService } from './bir-tax.service';
import { DeductionService } from './deduction.service';
import { DEFAULT_PAYROLL_SETTINGS, PayrollSettingsService } from './payroll-settings.service';
import { PayrollPeriodScheduler } from './payroll-period.scheduler';

/**
 * BUG-AX — payroll periods are standardized semi-monthly ranges owned by the
 * scheduler; manual creation is off-cycle only and may never overlap.
 * BUG-AY — timesheets carry a payment lifecycle (UNPAID → PROCESSING → PAID)
 * that payroll generation drives and reads back.
 */

const principal = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  permissions: [],
  roles: ['ADMIN'],
} as unknown as AuthPrincipal;

/** Builds a PayrollService over a mock Prisma, returning both for assertions. */
async function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    payrollPeriod: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'period-new',
        ...data,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    ...prismaOverrides,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PayrollService,
      { provide: PrismaService, useValue: prisma },
      { provide: NotificationsService, useValue: { create: jest.fn(), createMany: jest.fn() } },
      { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
      { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') } },
      { provide: OvertimeRateService, useValue: { forPrincipal: jest.fn().mockResolvedValue(1.25) } },
      DeductionService,
      BirTaxService,
      {
        provide: PayrollSettingsService,
        useValue: { forPrincipal: jest.fn().mockResolvedValue({ ...DEFAULT_PAYROLL_SETTINGS }) },
      },
      { provide: getQueueToken('payroll-export'), useValue: { add: jest.fn() } },
    ],
  }).compile();

  return { service: module.get(PayrollService), prisma };
}

// ── BUG-AX: manual creation is CUSTOM-only ───────────────────────────────────

describe('BUG-AX — createPeriod restricts manual creation to off-cycle CUSTOM periods', () => {
  it.each(['FIRST_HALF', 'SECOND_HALF'] as const)(
    'rejects a hand-made %s period — those are the scheduler\'s to mint',
    async (type) => {
      const { service, prisma } = await buildService();

      await expect(
        service.createPeriod(principal, { type, startDate: '2026-07-01', endDate: '2026-07-15' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // Rejected before any write — no competing standardized period is created.
      expect(prisma.payrollPeriod.create).not.toHaveBeenCalled();
    },
  );

  it('allows a CUSTOM off-cycle period (BUG-AT final-pay runs still work)', async () => {
    const { service, prisma } = await buildService();

    const period = await service.createPeriod(principal, {
      type: 'CUSTOM',
      startDate: '2026-07-20',
      endDate: '2026-07-22',
    });

    expect(period.type).toBe('CUSTOM');
    expect(prisma.payrollPeriod.create).toHaveBeenCalled();
  });
});

// ── BUG-AX: no overlapping periods (verify step f) ───────────────────────────

describe('BUG-AX — createPeriod rejects overlapping ranges, not just exact duplicates', () => {
  const existing = {
    id: 'period-jul-1',
    startDate: new Date('2026-07-01T00:00:00Z'),
    endDate: new Date('2026-07-15T00:00:00Z'),
  };

  /** Each case is a range that collides with the existing Jul 1–15 period. */
  it.each([
    ['fully contained', '2026-07-05', '2026-07-10'],
    ['straddling the start', '2026-06-28', '2026-07-03'],
    ['straddling the end', '2026-07-14', '2026-07-31'],
    ['fully containing', '2026-06-01', '2026-07-31'],
    ['exactly equal', '2026-07-01', '2026-07-15'],
    ['touching on the last day', '2026-07-15', '2026-07-17'],
  ])('rejects a %s range', async (_label, startDate, endDate) => {
    const { service } = await buildService({
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    });

    await expect(
      service.createPeriod(principal, { type: 'CUSTOM', startDate, endDate }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('builds an overlap query — not an exact-match query — so partial collisions are caught', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { service } = await buildService({
      payrollPeriod: {
        findFirst,
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p', ...data })),
      },
    });

    await service.createPeriod(principal, {
      type: 'CUSTOM',
      startDate: '2026-08-05',
      endDate: '2026-08-07',
    });

    // The regression this guards: `startDate: <exact>` let Jul 14–31 slip past a
    // Jul 1–31 period. The guard must be a range comparison in both directions.
    const where = findFirst.mock.calls[0][0].where;
    expect(where.startDate).toEqual({ lte: new Date('2026-08-07') });
    expect(where.endDate).toEqual({ gte: new Date('2026-08-05') });
  });

  it('permits an adjacent, non-overlapping range (Jul 16 after a Jul 1–15 period)', async () => {
    const { service, prisma } = await buildService();

    await service.createPeriod(principal, {
      type: 'CUSTOM',
      startDate: '2026-07-16',
      endDate: '2026-07-31',
    });

    expect(prisma.payrollPeriod.create).toHaveBeenCalled();
  });
});

// ── BUG-AX: the dropdown can ask for standardized periods only ───────────────

describe('BUG-AX — findAllPeriods filters on isAutoGenerated', () => {
  it('narrows to system-generated periods when isAutoGenerated=true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = await buildService({
      payrollPeriod: { findMany, findFirst: jest.fn() },
    });

    await service.findAllPeriods(principal, { isAutoGenerated: 'true' });

    expect(findMany.mock.calls[0][0].where.isAutoGenerated).toBe(true);
  });

  it('narrows to off-cycle periods when isAutoGenerated=false', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = await buildService({
      payrollPeriod: { findMany, findFirst: jest.fn() },
    });

    await service.findAllPeriods(principal, { isAutoGenerated: 'false' });

    expect(findMany.mock.calls[0][0].where.isAutoGenerated).toBe(false);
  });

  it('returns both kinds when the filter is omitted (pre-BUG-AX behaviour)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = await buildService({
      payrollPeriod: { findMany, findFirst: jest.fn() },
    });

    await service.findAllPeriods(principal, {});

    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('isAutoGenerated');
  });
});

// ── BUG-AX: the scheduler's date maths (verify steps a, c, d) ───────────────

describe('BUG-AX — scheduler generates standardized, non-overlapping semi-monthly periods', () => {
  /** Captures every period the scheduler would create for one org. */
  async function seed(year: number, month: number) {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1', tenantId: 'tenant-1' }]),
      },
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
      },
    };
    const scheduler = new PayrollPeriodScheduler(prisma as unknown as PrismaService);
    await scheduler.seedPeriodsForMonth(year, month);
    return { created, prisma };
  }

  it('creates 1st–15th and 16th–EOM for a 31-day month (July 2026)', async () => {
    const { created } = await seed(2026, 6); // month is 0-indexed

    expect(created).toHaveLength(2);

    const [first, second] = created;
    expect(first.type).toBe('FIRST_HALF');
    expect(first.startDate).toEqual(new Date('2026-07-01T00:00:00Z'));
    expect(first.endDate).toEqual(new Date('2026-07-15T00:00:00Z'));

    expect(second.type).toBe('SECOND_HALF');
    expect(second.startDate).toEqual(new Date('2026-07-16T00:00:00Z'));
    expect(second.endDate).toEqual(new Date('2026-07-31T00:00:00Z'));

    // Verify step (f): the two halves abut, they never overlap.
    expect(
      (second.startDate as Date).getTime() > (first.endDate as Date).getTime(),
    ).toBe(true);
    // Both are flagged so the dropdown can tell them from off-cycle periods.
    expect(created.every((p) => p.isAutoGenerated === true)).toBe(true);
  });

  it('ends the second half on the 28th in a non-leap February', async () => {
    const { created } = await seed(2026, 1);
    expect(created[1].endDate).toEqual(new Date('2026-02-28T00:00:00Z'));
  });

  it('ends the second half on the 29th in a leap February', async () => {
    const { created } = await seed(2028, 1);
    expect(created[1].endDate).toEqual(new Date('2028-02-29T00:00:00Z'));
  });

  it('is idempotent — an existing period for the same range is skipped', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1', tenantId: 'tenant-1' }]),
      },
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue({ id: 'already-there' }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
      },
    };
    const scheduler = new PayrollPeriodScheduler(prisma as unknown as PrismaService);
    await scheduler.seedPeriodsForMonth(2026, 6);

    expect(created).toHaveLength(0);
  });

  /**
   * Verify steps (c) and (d): the routing predicate used on supervisor approve
   * (approvals.service.ts) is "period.start <= sheet.start && period.end >= sheet.end".
   * These assert a Jul 8 sheet lands in Jul 1–15 and a Jul 20 sheet in Jul 16–31.
   */
  it('routes a timesheet to exactly one semi-monthly period by work date', async () => {
    const { created } = await seed(2026, 6);
    const periods = created.map((p) => ({
      type: p.type as string,
      startDate: p.startDate as Date,
      endDate: p.endDate as Date,
    }));

    const routeFor = (start: string, end: string) =>
      periods.filter(
        (p) => p.startDate <= new Date(start) && p.endDate >= new Date(end),
      );

    const julyEight = routeFor('2026-07-08T00:00:00Z', '2026-07-08T00:00:00Z');
    expect(julyEight).toHaveLength(1);
    expect(julyEight[0].type).toBe('FIRST_HALF');

    const julyTwenty = routeFor('2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z');
    expect(julyTwenty).toHaveLength(1);
    expect(julyTwenty[0].type).toBe('SECOND_HALF');
  });
});

// ── BUG-AY: payment lifecycle ────────────────────────────────────────────────

describe('BUG-AY — payroll generation drives the timesheet payment lifecycle', () => {
  /** Runs generateReport against a period with one approved timesheet. */
  async function generate(groupByRows: { paymentStatus: string; _count: { _all: number } }[] = []) {
    const reportUpdates: Record<string, unknown>[] = [];
    const tx = {
      payrollReport: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'report-1' }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          reportUpdates.push(data);
          return data;
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'report-1', lineItems: [] }),
      },
      payrollLineItem: { deleteMany: jest.fn(), create: jest.fn(async (a: unknown) => a) },
      payrollPeriod: { update: jest.fn().mockResolvedValue({}) },
      timesheet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue(groupByRows),
      },
    };

    const approvedTimesheets = [
      { id: 'ts-1', userId: 'user-1', totalMinutes: 480, overtimeMinutesOverride: null },
    ];

    const prisma = {
      payrollPeriod: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'period-1',
          status: 'DRAFT',
          startDate: new Date('2026-07-01T00:00:00Z'),
          endDate: new Date('2026-07-15T00:00:00Z'),
        }),
      },
      payrollReport: { findFirst: jest.fn().mockResolvedValue(null) },
      timesheet: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(approvedTimesheets)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', hourlyRate: 100 }]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      clearanceChecklist: { findFirst: jest.fn().mockResolvedValue(null) },
      shift: { findMany: jest.fn().mockResolvedValue([]) },
      payrollLineItem: { groupBy: jest.fn().mockResolvedValue([]) },
      birTaxTable: { findFirst: jest.fn().mockResolvedValue(null) },
      idempotencyKey: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    const { service } = await buildService(prisma);
    await service.generateReport(principal, 'period-1', 'idem-1');
    return { tx, prisma, reportUpdates };
  }

  it('excludes already-PAID timesheets from the run (no duplicate processing)', async () => {
    const { prisma } = await generate();

    const approvedQuery = (prisma.timesheet.findMany as jest.Mock).mock.calls[0][0];
    expect(approvedQuery.where.paymentStatus).toEqual({ not: 'PAID' });
  });

  it('moves the included timesheets UNPAID → PROCESSING', async () => {
    const { tx } = await generate();

    expect(tx.timesheet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['ts-1'] },
          // Guard: only UNPAID sheets advance, so a PAID sheet can never be
          // walked backwards to PROCESSING by a re-generation.
          paymentStatus: 'UNPAID',
        }),
        data: expect.objectContaining({ paymentStatus: 'PROCESSING' }),
      }),
    );
  });

  it('writes a payment-status breakdown onto the report totals (verify step e)', async () => {
    const { reportUpdates } = await generate([
      { paymentStatus: 'PROCESSING', _count: { _all: 3 } },
      { paymentStatus: 'PAID', _count: { _all: 2 } },
    ]);

    const totals = reportUpdates[0].totals as Record<string, unknown>;
    expect(totals.paymentStatusBreakdown).toEqual({
      UNPAID: 0,
      PROCESSING: 3,
      PAID: 2,
    });
  });

  it('reports a zeroed breakdown when the period has no timesheets', async () => {
    const { reportUpdates } = await generate([]);

    expect((reportUpdates[0].totals as Record<string, unknown>).paymentStatusBreakdown).toEqual({
      UNPAID: 0,
      PROCESSING: 0,
      PAID: 0,
    });
  });
});
