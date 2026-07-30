import { Test, TestingModule } from '@nestjs/testing';
import { LeaveService } from './leave.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

describe('LeaveService.findMany', () => {
  let service: LeaveService;
  let findMany: jest.Mock;
  let orgFindFirst: jest.Mock;

  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: [],
  } as unknown as AuthPrincipal;

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([]);
    orgFindFirst = jest.fn().mockResolvedValue({ timezone: 'Asia/Manila' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        {
          provide: PrismaService,
          useValue: { leaveRequest: { findMany }, organization: { findFirst: orgFindFirst } },
        },
        { provide: NotificationsService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: StorageService, useValue: { signedUrlsByKey: jest.fn().mockResolvedValue({}) } },
        { provide: DepartmentScopeService, useValue: {} },
        {
          provide: OrgTimeZoneService,
          useValue: { forPrincipal: (...args: unknown[]) => orgFindFirst(...args).then((o: any) => o?.timezone || 'Asia/Manila') },
        },
      ],
    }).compile();

    service = module.get(LeaveService);
  });

  async function whereFor(query: Record<string, string>) {
    await service.findMany(principal, { scope: 'self', ...query } as any);
    return findMany.mock.calls[0][0].where;
  }

  it('resolves a reviewedAt day window in the organization timezone', async () => {
    const where = await whereFor({
      status: 'APPROVED',
      reviewedAtFrom: '2026-07-28',
      reviewedAtTo: '2026-07-28',
    });

    // Manila is UTC+8, so 2026-07-28 locally spans 2026-07-27T16:00Z → 2026-07-28T16:00Z.
    // The upper bound is exclusive (start of the next local day) so the whole day counts.
    expect(where.reviewedAt.gte).toEqual(new Date('2026-07-27T16:00:00.000Z'));
    expect(where.reviewedAt.lt).toEqual(new Date('2026-07-28T16:00:00.000Z'));
  });

  it('falls back to Manila when the organization has no timezone set', async () => {
    orgFindFirst.mockResolvedValue({ timezone: null });

    const where = await whereFor({ reviewedAtFrom: '2026-07-28' });

    expect(where.reviewedAt.gte).toEqual(new Date('2026-07-27T16:00:00.000Z'));
  });

  it('honours a non-Manila organization timezone', async () => {
    orgFindFirst.mockResolvedValue({ timezone: 'America/New_York' });

    const where = await whereFor({ reviewedAtFrom: '2026-07-28', reviewedAtTo: '2026-07-28' });

    // EDT is UTC-4 in July.
    expect(where.reviewedAt.gte).toEqual(new Date('2026-07-28T04:00:00.000Z'));
    expect(where.reviewedAt.lt).toEqual(new Date('2026-07-29T04:00:00.000Z'));
  });

  it('does not query the organization when no reviewedAt filter is used', async () => {
    await whereFor({ status: 'PENDING' });
    expect(orgFindFirst).not.toHaveBeenCalled();
  });
});

describe('LeaveService.returnFromLeave', () => {
  let service: LeaveService;
  let update: jest.Mock;

  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: [],
  } as unknown as AuthPrincipal;

  /** Builds the service around one APPROVED request and captures the update payload. */
  async function buildWith(request: Record<string, unknown>) {
    update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...request, ...data }));
    const tx = { leaveRequest: { update }, auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      leaveRequest: { findFirst: jest.fn().mockResolvedValue(request) },
      user: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: UploadService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: DepartmentScopeService, useValue: {} },
        { provide: OrgTimeZoneService, useValue: {} },
      ],
    }).compile();
    service = module.get(LeaveService);
  }

  const baseRequest = {
    id: 'leave-1',
    userId: 'user-1',
    status: 'APPROVED',
    type: 'SICK',
    days: 11,
    version: 1,
  };

  it('recomputes days to the business days actually taken when returning early', async () => {
    // Fri 2026-07-24 through Fri 2026-08-07, cut short by returning today.
    await buildWith({
      ...baseRequest,
      startDate: new Date('2026-07-24T00:00:00.000Z'),
      endDate: new Date('2026-08-07T00:00:00.000Z'),
    });

    jest.useFakeTimers().setSystemTime(new Date('2026-07-28T09:00:00.000Z'));
    try {
      await service.returnFromLeave(principal, 'leave-1');
    } finally {
      jest.useRealTimers();
    }

    const { data } = update.mock.calls[0][0];
    // endDate moves to yesterday (Mon 2026-07-27), so only Fri 24 and Mon 27
    // were business days actually taken — not the 11 originally requested.
    expect(data.endDate).toEqual(new Date('2026-07-27T00:00:00.000Z'));
    expect(data.days).toBe(2);
    expect(data.status).toBe('COMPLETED');
  });

  it('keeps a same-day leave at one day rather than going negative', async () => {
    await buildWith({
      ...baseRequest,
      days: 1,
      startDate: new Date('2026-07-28T00:00:00.000Z'),
      endDate: new Date('2026-07-28T00:00:00.000Z'),
    });

    jest.useFakeTimers().setSystemTime(new Date('2026-07-28T09:00:00.000Z'));
    try {
      await service.returnFromLeave(principal, 'leave-1');
    } finally {
      jest.useRealTimers();
    }

    const { data } = update.mock.calls[0][0];
    // Yesterday precedes startDate, so endDate is clamped to startDate.
    expect(data.endDate).toEqual(new Date('2026-07-28T00:00:00.000Z'));
    expect(data.days).toBe(1);
  });
});
