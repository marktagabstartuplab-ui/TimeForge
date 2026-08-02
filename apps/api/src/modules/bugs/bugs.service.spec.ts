import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BugsService } from './bugs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { AuthPrincipal } from '../../common/decorators';

describe('BugsService', () => {
  let service: BugsService;
  let bugFindMany: jest.Mock;
  let bugFindFirst: jest.Mock;
  let bugUpdate: jest.Mock;
  let bugDelete: jest.Mock;
  let notificationDeleteMany: jest.Mock;
  let teamUserIds: jest.Mock;
  let notificationCreate: jest.Mock;

  function principal(permissions: string[]): AuthPrincipal {
    return {
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      permissions,
      roles: [],
    } as unknown as AuthPrincipal;
  }

  /** Runs `fn` inside the $transaction callback against the same mock client. */
  function makeTransaction(client: Record<string, unknown>) {
    return jest.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(client) : Promise.resolve(arg),
    );
  }

  beforeEach(async () => {
    bugFindMany = jest.fn().mockResolvedValue([]);
    bugFindFirst = jest.fn().mockResolvedValue(null);
    bugUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'bug-1', ...data }));
    bugDelete = jest.fn().mockResolvedValue({ id: 'bug-1' });
    notificationDeleteMany = jest.fn().mockResolvedValue({ count: 3 });
    teamUserIds = jest.fn().mockResolvedValue(['user-1', 'user-2']);
    notificationCreate = jest.fn().mockResolvedValue(undefined);

    const prismaMock: Record<string, unknown> = {
      bug: {
        findMany: bugFindMany,
        findFirst: bugFindFirst,
        update: bugUpdate,
        delete: bugDelete,
        count: jest.fn(),
      },
      bugActivityLog: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
      bugComment: { create: jest.fn() },
      notification: { deleteMany: notificationDeleteMany },
      auditLog: { create: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-2' }), findMany: jest.fn().mockResolvedValue([]) },
    };
    prismaMock.$transaction = makeTransaction(prismaMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BugsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: { create: notificationCreate } },
        { provide: UploadService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: DepartmentScopeService, useValue: { teamUserIds } },
      ],
    }).compile();

    service = module.get(BugsService);
  });

  describe('findMany scoping', () => {
    it('limits a plain reporter to their own and assigned bugs', async () => {
      await service.findMany(principal(['bug:read']), {});
      expect(bugFindMany.mock.calls[0][0].where.OR).toEqual([
        { reportedBy: 'user-1' },
        { assignedTo: 'user-1' },
      ]);
    });

    it('widens a supervisor to their department members', async () => {
      await service.findMany(principal(['bug:read', 'bug:read_team']), {});
      expect(bugFindMany.mock.calls[0][0].where.reportedBy).toEqual({ in: ['user-1', 'user-2'] });
    });

    it('applies no reporter filter for org-level readers', async () => {
      await service.findMany(principal(['bug:read', 'bug:read_org']), {});
      const { where } = bugFindMany.mock.calls[0][0];
      expect(where.OR).toBeUndefined();
      expect(where.reportedBy).toBeUndefined();
      expect(where.tenantId).toBe('tenant-1');
      expect(where.organizationId).toBe('org-1');
    });

    it('rejects an org scope the caller has not been granted', async () => {
      await expect(service.findMany(principal(['bug:read']), { scope: 'org' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('findOne visibility', () => {
    it('refuses a bug outside the caller’s scope', async () => {
      bugFindFirst.mockResolvedValue({ id: 'bug-9', reportedBy: 'other', assignedTo: null });
      await expect(service.findOne(principal(['bug:read']), 'bug-9')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s on an unknown id', async () => {
      bugFindFirst.mockResolvedValue(null);
      await expect(service.findOne(principal(['*']), 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const existing = {
      id: 'bug-1',
      status: 'OPEN',
      priority: 'MEDIUM',
      severity: 'P3',
      assignedTo: null,
      reportedBy: 'user-3',
      title: 'Broken button',
    };

    it('stamps resolvedAt when a bug reaches a terminal status', async () => {
      bugFindFirst.mockResolvedValue(existing);
      await service.update(principal(['*']), 'bug-1', { status: 'FIXED' });
      expect(bugUpdate.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);
    });

    it('clears resolvedAt when a bug is reopened', async () => {
      bugFindFirst.mockResolvedValue({ ...existing, status: 'FIXED' });
      await service.update(principal(['*']), 'bug-1', { status: 'OPEN' });
      expect(bugUpdate.mock.calls[0][0].data.resolvedAt).toBeNull();
    });

    it('is a no-op when nothing actually changes', async () => {
      bugFindFirst.mockResolvedValue(existing);
      const result = await service.update(principal(['*']), 'bug-1', { status: 'OPEN' });
      expect(bugUpdate).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('emails the new assignee on assignment', async () => {
      bugFindFirst.mockResolvedValue(existing);
      await service.update(principal(['*']), 'bug-1', { assignedTo: 'user-2' });
      const notification = notificationCreate.mock.calls.find((c) => c[0].userId === 'user-2')?.[0];
      expect(notification).toBeDefined();
      expect(notification.channel).toBe('EMAIL');
      expect(notification.actionUrl).toBe('/bugs/bug-1');
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      bugFindFirst.mockResolvedValue({ id: 'bug-1', title: 'Broken button', attachments: [] });
    });

    it('sweeps the notifications that point at the deleted bug', async () => {
      // Notification has no FK to Bug, so the DB cascade cannot reach these —
      // without the explicit deleteMany they survive and their actionUrl
      // (/bugs/:id) leads to a dead page.
      const result = await service.remove(principal(['*']), 'bug-1');

      expect(notificationDeleteMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', metadata: { path: ['bugId'], equals: 'bug-1' } },
      });
      expect(result).toEqual({ id: 'bug-1', deleted: true, notificationsRemoved: 3 });
    });

    it('removes the notifications before the bug row, inside the transaction', async () => {
      await service.remove(principal(['*']), 'bug-1');

      const sweepOrder = notificationDeleteMany.mock.invocationCallOrder[0];
      const deleteOrder = bugDelete.mock.invocationCallOrder[0];
      expect(sweepOrder).toBeLessThan(deleteOrder);
    });

    it('404s instead of deleting when the bug is not visible', async () => {
      bugFindFirst.mockResolvedValue(null);
      await expect(service.remove(principal(['*']), 'nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(notificationDeleteMany).not.toHaveBeenCalled();
      expect(bugDelete).not.toHaveBeenCalled();
    });
  });
});
