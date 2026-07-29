import { Test, TestingModule } from '@nestjs/testing';
import { TimeTrackingService } from './time-tracking.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { AuthPrincipal } from '../../common/decorators';
import { encodeCursor } from '../../common/crud/crud.service';

/**
 * Pagination used `where: { id: { gt: cursor } }` while ordering by
 * `startTime desc`. Paging by a key the result set is not sorted on makes
 * page N+1 return whatever happens to have a larger id, so rows repeat and
 * others become unreachable. Walking every page of one employee's month
 * returned 112 rows for 102 entries, which inflated the Timesheet total by
 * ~27h. Prisma's native cursor positions within `orderBy` instead.
 */
describe('TimeTrackingService.findAll — cursor pagination', () => {
  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: ['time_entry:read_self'],
    roles: ['EMPLOYEE'],
  } as unknown as AuthPrincipal;

  async function findMany(query: Record<string, unknown>) {
    const timeEntryFindMany = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeTrackingService,
        { provide: PrismaService, useValue: { timeEntry: { findMany: timeEntryFindMany } } },
        { provide: UploadService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: DepartmentScopeService, useValue: { teamUserIds: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    await module.get(TimeTrackingService).findAll(principal, query as never);
    return timeEntryFindMany.mock.calls[0][0];
  }

  it('does not filter on id — that was the defect', async () => {
    const args = await findMany({ cursor: encodeCursor('entry-42'), limit: '100' });
    expect(args.where.id).toBeUndefined();
  });

  it('uses Prisma\'s native cursor, which positions within orderBy', async () => {
    const args = await findMany({ cursor: encodeCursor('entry-42'), limit: '100' });
    expect(args.cursor).toEqual({ id: 'entry-42' });
    expect(args.skip).toBe(1);
  });

  it('orders by startTime with a unique id tiebreaker, so the cursor is stable', async () => {
    const args = await findMany({ cursor: encodeCursor('entry-42') });
    expect(args.orderBy).toEqual([{ startTime: 'desc' }, { id: 'asc' }]);
  });

  it('omits cursor and skip entirely on the first page', async () => {
    const args = await findMany({ limit: '100' });
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
  });

  it('still applies the startTime range filter alongside the cursor', async () => {
    const args = await findMany({
      cursor: encodeCursor('entry-42'),
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.000Z',
    });
    expect(args.where.startTime).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-31T23:59:59.000Z'),
    });
    expect(args.cursor).toEqual({ id: 'entry-42' });
  });
});
