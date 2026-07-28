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
