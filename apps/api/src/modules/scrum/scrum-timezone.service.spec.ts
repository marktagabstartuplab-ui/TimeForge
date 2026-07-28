import { Test, TestingModule } from '@nestjs/testing';
import { ScrumService } from './scrum.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { StorageService } from '../storage/storage.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * ScrumEntry.entryDate is a date-only column holding the employee's *local*
 * calendar day. "Today" therefore has to be the organization's local day — a
 * UTC-derived one pointed at yesterday until 08:00 Manila, so the Daily Scrum
 * dashboard read a day behind every morning.
 */
describe('ScrumService — local days and weeks', () => {
  const principal = {
    userId: 'sup-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: ['*'],
    roles: ['SUPERVISOR'],
  } as unknown as AuthPrincipal;

  async function buildService(timeZone: string) {
    const scrumEntryFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-1', departmentId: null, department: null }]) },
      scrumEntry: {
        findMany: scrumEntryFindMany,
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'entry-1', entryDate: new Date('2026-07-29T00:00:00Z') }),
      },
      scrumBlocker: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      scrumTask: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      team: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrumService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: {} },
        {
          provide: DepartmentScopeService,
          useValue: { managedDepartmentIds: jest.fn().mockResolvedValue([]), teamUserIds: jest.fn().mockResolvedValue(['emp-1']) },
        },
        { provide: StorageService, useValue: {} },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue(timeZone) } },
      ],
    }).compile();

    return { service: module.get(ScrumService), scrumEntryFindMany };
  }

  afterEach(() => jest.useRealTimers());

  describe('weekly heatmap', () => {
    it('uses the local ISO week on a Manila Monday morning', async () => {
      // 2026-07-27T00:30+08:00 — Monday locally, still Sunday 07-26 in UTC.
      jest.useFakeTimers().setSystemTime(new Date('2026-07-26T16:30:00Z'));
      const { service } = await buildService('Asia/Manila');

      const result = await (service as unknown as {
        heatmap: (p: AuthPrincipal, q: Record<string, string>) => Promise<{ days: string[] }>;
      }).heatmap(principal, {});

      expect(result.days).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    });

    it('regression: UTC put that same moment in the previous week', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-26T16:30:00Z'));

      const { service: manila, scrumEntryFindMany: manilaEntries } = await buildService('Asia/Manila');
      await (manila as unknown as { heatmap: (p: AuthPrincipal, q: Record<string, string>) => Promise<unknown> })
        .heatmap(principal, {});
      const manilaStart = manilaEntries.mock.calls[0][0].where.entryDate.gte;

      const { service: utc, scrumEntryFindMany: utcEntries } = await buildService('UTC');
      await (utc as unknown as { heatmap: (p: AuthPrincipal, q: Record<string, string>) => Promise<unknown> })
        .heatmap(principal, {});
      const utcStart = utcEntries.mock.calls[0][0].where.entryDate.gte;

      // Local: the week that just began. UTC: the week that is ending.
      expect(manilaStart).toEqual(new Date('2026-07-27T00:00:00.000Z'));
      expect(utcStart).toEqual(new Date('2026-07-20T00:00:00.000Z'));
    });
  });

  describe('entryDate validation', () => {
    it('accepts the local day during the Manila pre-dawn window', async () => {
      // 2026-07-29T00:30+08:00 — the client's local date is 2026-07-29 while UTC
      // still reads 2026-07-28.
      jest.useFakeTimers().setSystemTime(new Date('2026-07-28T16:30:00Z'));
      const { service } = await buildService('Asia/Manila');

      await expect(
        service.create(principal, { entryDate: '2026-07-29', today: 'Plan' } as never),
      ).resolves.toBeDefined();
    });

    it('still refuses a genuinely future date', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-28T16:30:00Z'));
      const { service } = await buildService('Asia/Manila');

      await expect(
        service.create(principal, { entryDate: '2026-07-30', today: 'Plan' } as never),
      ).rejects.toThrow(/future/i);
    });
  });
});
