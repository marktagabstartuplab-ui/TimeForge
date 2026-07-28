import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Decimal } from '@prisma/client/runtime/library';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../../infra/cache.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

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

  async function generateWith(timeZone: string) {
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

  it('regression: UTC day boundaries hid the overtime entirely', async () => {
    // UTC splits the same shift into 2h on 07-28 and 8h on 07-29 — neither
    // bucket exceeds 8h, so overtime came out as zero and pay was understated.
    const item = await generateWith('UTC');

    expect(Number(item.overtimeHours)).toBe(0);
    expect(Number(item.estimatedPay)).toBe(1000);
  });
});
