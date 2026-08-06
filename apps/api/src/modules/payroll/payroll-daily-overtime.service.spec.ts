import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Decimal } from '@prisma/client/runtime/library';
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

/**
 * A Manila work day starts before UTC midnight, so grouping time entries by UTC
 * day split one shift across two buckets — each under the 8h threshold — and the
 * overtime silently vanished from the payroll line item.
 */
describe('PayrollService.generateReport — daily overtime uses local days', () => {
  const principal = {
    userId: 'admin-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: ['ADMIN'],
  } as unknown as AuthPrincipal;

  const period = {
    id: 'period-1',
    status: 'DRAFT',
    startDate: new Date('2026-07-01T00:00:00Z'),
    endDate: new Date('2026-07-31T00:00:00Z'),
  };

  /** One 10-hour Manila shift: 2026-07-29 06:00–16:00 +08:00 (= 07-28T22:00Z → 07-29T08:00Z). */
  const shiftEntries = [
    {
      userId: 'user-1',
      timesheetId: 'ts-1',
      startTime: new Date('2026-07-28T22:00:00Z'), // 06:00 local, 07-29
      durationMinutes: 120,
    },
    {
      userId: 'user-1',
      timesheetId: 'ts-1',
      startTime: new Date('2026-07-29T00:00:00Z'), // 08:00 local, 07-29
      durationMinutes: 480,
    },
  ];

  async function generateWith(timeZone: string, overtimeMultiplier = 1.25) {
    const lineItems: Record<string, unknown>[] = [];
    const tx = {
      payrollReport: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'report-1' }),
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'report-1', lineItems }),
      },
      payrollLineItem: {
        deleteMany: jest.fn(),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lineItems.push(data);
          return data;
        }),
      },
      payrollPeriod: { update: jest.fn().mockResolvedValue({}) },
      // BUG-AY: generateReport moves the included timesheets UNPAID → PROCESSING
      // and reads back the payment-status breakdown for the report totals.
      timesheet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    const prisma = {
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue(period) },
      payrollReport: { findFirst: jest.fn().mockResolvedValue(null) },
      timesheet: {
        findMany: jest
          .fn()
          // approved, then pending, then rejected
          .mockResolvedValueOnce([
            { id: 'ts-1', userId: 'user-1', totalMinutes: 600, overtimeMinutesOverride: null },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1', hourlyRate: new Decimal(100) }]),
      },
      timeEntry: { findMany: jest.fn().mockResolvedValue(shiftEntries) },
      // FEAT-3 reads: no holidays in the period, and no prior periods this tax year.
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn(), createMany: jest.fn() } },
        { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue(timeZone) } },
        {
          provide: OvertimeRateService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue(overtimeMultiplier) },
        },
        // FEAT-3: the real deduction/tax engines, so these cases also assert the
        // statutory figures land on the line item. Settings are the 2026 defaults.
        DeductionService,
        BirTaxService,
        {
          provide: PayrollSettingsService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue({ ...DEFAULT_PAYROLL_SETTINGS }) },
        },
        { provide: getQueueToken('payroll-export'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    const service = module.get(PayrollService);
    await service.generateReport(principal, 'period-1', 'idem-1');
    return lineItems[0];
  }

  it('counts a 10-hour Manila shift as 8 regular + 2 overtime hours', async () => {
    const item = await generateWith('Asia/Manila');

    expect(Number(item.overtimeHours)).toBe(2);
    expect(Number(item.approvedHours)).toBe(10);
    // 8h × ₱100 + 2h × ₱100 × 1.25 = ₱1050
    expect(Number(item.estimatedPay)).toBe(1050);
  });

  // FEAT-3 — the generation path must also land the statutory breakdown on the
  // line item, and that breakdown must sum to its own net pay.
  it('writes the Philippine statutory breakdown onto the line item', async () => {
    const item = await generateWith('Asia/Manila');

    expect(Number(item.regularPay)).toBe(800); // 8h × ₱100
    expect(Number(item.overtimePay)).toBe(250); // 2h × ₱100 × 1.25
    expect(Number(item.grossTotal)).toBe(1050); // no holidays, no night hours

    expect(Number(item.sssContribution)).toBe(52.5); // 1,050 × 5%
    // 1,050 × 5% is only ₱52.50, below the ₱500 PhilHealth floor, so the total
    // premium is raised to the floor and the employee carries half of it.
    expect(Number(item.philhealthContribution)).toBe(250);
    expect(Number(item.pagibigContribution)).toBe(10.5); // at/below ₱1,500 → 1%

    // Well under the ₱250,000 annual exemption, so nothing is withheld.
    expect(Number(item.incomeTaxWithheld)).toBe(0);

    expect(Number(item.totalDeductions)).toBe(313);
    expect(Number(item.netPay)).toBe(737);
    expect(Number(item.grossTotal) - Number(item.totalDeductions)).toBe(Number(item.netPay));
  });

  // BUG-AQ — the premium used to be a hardcoded 1.25 in the pay formula, so an
  // organization on a different labour-law or contract rate could not express it.
  it('prices overtime with the organization-configured multiplier', async () => {
    const item = await generateWith('Asia/Manila', 1.5);

    // 8h × ₱100 + 2h × ₱100 × 1.5 = ₱1100
    expect(Number(item.overtimeHours)).toBe(2);
    expect(Number(item.estimatedPay)).toBe(1100);
  });

  it('regression: UTC day boundaries hid the overtime entirely', async () => {
    // UTC splits the same shift into 2h on 07-28 and 8h on 07-29 — neither
    // bucket exceeds 8h, so overtime came out as zero and pay was understated.
    const item = await generateWith('UTC');

    expect(Number(item.overtimeHours)).toBe(0);
    expect(Number(item.estimatedPay)).toBe(1000);
  });
});
