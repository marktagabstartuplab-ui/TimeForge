import { Test, TestingModule } from '@nestjs/testing';
import { TimesheetsService } from './timesheets.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { StorageService } from '../storage/storage.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * Timesheet.totalMinutes is a cache of the attached time entries, which are the
 * ledger payroll actually pays from. Only submit() used to recompute it, so
 * attaching or detaching entries on a draft left the header quoting a total no
 * entry supported — the timesheet screen showed hours while payroll paid zero,
 * silently.
 */

const principal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  permissions: [],
  roles: ['EMPLOYEE'],
} as unknown as AuthPrincipal;

const draftSheet = {
  id: 'ts-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1',
  status: 'DRAFT',
  periodStart: new Date('2026-07-01T00:00:00Z'),
  periodEnd: new Date('2026-07-15T00:00:00Z'),
  totalMinutes: 0,
  version: 0,
  deletedAt: null,
};

async function buildService(entrySumMinutes: number) {
  const prisma = {
    timesheet: {
      findFirst: jest.fn().mockResolvedValue(draftSheet),
      findUniqueOrThrow: jest.fn().mockResolvedValue(draftSheet),
      update: jest.fn().mockResolvedValue(draftSheet),
    },
    timeEntry: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'entry-1', timesheetId: null, userId: 'user-1', deletedAt: null },
      ]),
      findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', timesheetId: 'ts-1', deletedAt: null }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { durationMinutes: entrySumMinutes } }),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ supervisorId: null }) },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TimesheetsService,
      { provide: PrismaService, useValue: prisma },
      { provide: NotificationsService, useValue: { create: jest.fn() } },
      { provide: ApprovalsService, useValue: { decide: jest.fn() } },
      { provide: DepartmentScopeService, useValue: { userIdsForDepartment: jest.fn() } },
      { provide: StorageService, useValue: { signedUrl: jest.fn() } },
      { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') } },
    ],
  }).compile();

  return { service: module.get(TimesheetsService), prisma };
}

/** The totalMinutes written by the last timesheet.update call, if any. */
function lastWrittenTotal(prisma: any): number | undefined {
  const call = prisma.timesheet.update.mock.calls
    .map(([args]: [{ data: Record<string, unknown> }]) => args.data)
    .reverse()
    .find((data: Record<string, unknown>) => data.totalMinutes !== undefined);
  return call?.totalMinutes as number | undefined;
}

describe('Timesheet.totalMinutes stays derived from its entries', () => {
  it('recomputes the header when entries are attached', async () => {
    const { service, prisma } = await buildService(150);

    await service.attachEntries(principal, 'ts-1', { entryIds: ['entry-1'] } as any);

    expect(prisma.timeEntry.aggregate).toHaveBeenCalled();
    expect(lastWrittenTotal(prisma)).toBe(150);
  });

  it('recomputes the header when an entry is detached', async () => {
    const { service, prisma } = await buildService(0);

    await service.detachEntry(principal, 'ts-1', 'entry-1');

    expect(lastWrittenTotal(prisma)).toBe(0);
  });

  // The exact shape of the three production rows this came from: a header
  // claiming minutes with no entries left behind it.
  it('drops the header to zero when the last entry leaves', async () => {
    const { service, prisma } = await buildService(0);

    await service.detachEntry(principal, 'ts-1', 'entry-1');

    expect(lastWrittenTotal(prisma)).toBe(0);
    expect(lastWrittenTotal(prisma)).not.toBe(95);
  });

  // Derived field, not a user edit — bumping it would invalidate the caller's
  // optimistic-lock token for its next write (same reasoning as
  // recalcEntryProgress in ScrumService).
  it('does not bump the sheet version when recomputing', async () => {
    const { service, prisma } = await buildService(150);

    await service.attachEntries(principal, 'ts-1', { entryIds: ['entry-1'] } as any);

    const recalcCall = prisma.timesheet.update.mock.calls
      .map(([args]: [{ data: Record<string, unknown> }]) => args.data)
      .find((data: Record<string, unknown>) => data.totalMinutes !== undefined);
    expect(recalcCall).not.toHaveProperty('version');
  });
});
