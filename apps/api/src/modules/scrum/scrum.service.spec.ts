import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ScrumService } from './scrum.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { StorageService } from '../storage/storage.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

const principal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  roles: ['EMPLOYEE'],
  permissions: [],
} as unknown as AuthPrincipal;

const baseTask = {
  id: 'task-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  scrumEntryId: 'entry-1',
  employeeId: 'user-1',
  title: 'Call 50 leads',
  description: null,
  expectedOutput: 'Calls logged',
  measurement: 'Calls',
  projectId: null,
  taskStatus: 'COMPLETED',
  completedAt: new Date(),
  estimatedHours: null,
  actualHours: null,
  priority: 'MEDIUM',
  kpi: 'Calls',
  plannedTarget: '50',
  actualCompleted: '50',
  continueTomorrow: false,
  notCompletedReason: null,
  kpiTemplateId: null,
  version: 3,
  deletedAt: null,
};

describe('ScrumService — completed commitment lock-down', () => {
  let service: ScrumService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      scrumTask: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
      scrumEntry: { findFirst: jest.fn(), update: jest.fn() },
      scrumEditRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
      user: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrumService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: OrgTimeZoneService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') },
        },
      ],
    }).compile();

    service = module.get(ScrumService);
  });

  it('rejects a plan edit of a COMPLETED commitment', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue(baseTask);

    await expect(
      service.updateTask(principal, 'task-1', { title: 'Rewritten', version: 3 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.scrumTask.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a COMPLETED commitment', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue(baseTask);

    await expect(service.deleteTask(principal, 'task-1', 3)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.scrumTask.update).not.toHaveBeenCalled();
  });

  it('still allows the EOD result-only update on a COMPLETED commitment', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue(baseTask);
    prisma.scrumTask.update.mockResolvedValue({ ...baseTask, actualCompleted: '55' });
    prisma.scrumTask.findMany.mockResolvedValue([{ taskStatus: 'COMPLETED' }]);
    prisma.scrumEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      submittedAt: new Date(),
      isLocked: true,
    });
    prisma.scrumEntry.update.mockResolvedValue({});

    await service.updateTask(principal, 'task-1', { actualCompleted: '55', version: 3 } as any);
    expect(prisma.scrumTask.update).toHaveBeenCalled();
  });

  it('allows editing a commitment that is not COMPLETED', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue({ ...baseTask, taskStatus: 'IN_PROGRESS', completedAt: null });
    prisma.scrumTask.update.mockResolvedValue({ ...baseTask, title: 'Rewritten' });
    prisma.scrumTask.findMany.mockResolvedValue([{ taskStatus: 'IN_PROGRESS' }]);
    prisma.scrumEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      submittedAt: null,
      isLocked: false,
    });
    prisma.scrumEntry.update.mockResolvedValue({});

    await service.updateTask(principal, 'task-1', { title: 'Rewritten', version: 3 } as any);
    expect(prisma.scrumTask.update).toHaveBeenCalled();
  });

  // completeTask is idempotent: re-completing an already-COMPLETED task is a
  // no-op and must not require a current version token, or a repeat click after
  // the version moved on 409s forever instead of quietly succeeding.
  it('completing an already-COMPLETED task is a no-op even on a stale version', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue(baseTask); // taskStatus COMPLETED, version 3

    const result = await service.completeTask(principal, 'task-1', 1); // stale version

    expect(result).toEqual(baseTask);
    expect(prisma.scrumTask.update).not.toHaveBeenCalled();
  });

  it('still rejects completing a not-yet-complete task on a stale version', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue({ ...baseTask, taskStatus: 'IN_PROGRESS', completedAt: null });

    await expect(service.completeTask(principal, 'task-1', 1)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.scrumTask.update).not.toHaveBeenCalled();
  });

  // BUG-W — recalcEntryProgress used to bump the parent entry's version. That
  // invalidated the optimistic-lock token held by the very client that wrote the
  // task, so the End of Day Review (write tasks, then update the entry) always
  // 409'd "Version mismatch" in a plain single-user submit.
  it('does not bump the entry version when recomputing derived progress', async () => {
    prisma.scrumTask.findFirst.mockResolvedValue({ ...baseTask, taskStatus: 'IN_PROGRESS', completedAt: null });
    prisma.scrumTask.update.mockResolvedValue({ ...baseTask, actualCompleted: '55' });
    prisma.scrumTask.findMany.mockResolvedValue([{ taskStatus: 'COMPLETED' }]);
    prisma.scrumEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      submittedAt: new Date(),
      isLocked: false,
    });
    prisma.scrumEntry.update.mockResolvedValue({});

    await service.updateTask(principal, 'task-1', { actualCompleted: '55', version: 3 } as any);

    expect(prisma.scrumEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ progress: 100, status: 'COMPLETED', isLocked: true }),
      }),
    );
    const [{ data }] = prisma.scrumEntry.update.mock.calls.at(-1)!;
    expect(data).not.toHaveProperty('version');
  });

  // BUG-AE — a locked (submitted) Daily Scrum is a read-only record. The entry
  // PATCH had no lock check at all, so the free-text plan fields could still be
  // rewritten by a direct API call after submission.
  describe('BUG-AE — locked entry is read-only', () => {
    const lockedEntry = {
      id: 'entry-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      isLocked: true,
      version: 4,
      yesterday: 'Shipped the report',
      today: 'Call 50 leads',
      blockers: null,
      notes: null,
      progress: 100,
      status: 'COMPLETED',
    };

    it('rejects a plan edit of a locked entry with 403', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(lockedEntry);

      await expect(
        service.update(principal, 'entry-1', { yesterday: 'Rewritten', version: 4 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
    });

    // The refusal must not depend on holding a current version token — a locked
    // record is refused outright, not "retry with a fresher version".
    it('rejects a locked-entry edit even on a stale version', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(lockedEntry);

      await expect(
        service.update(principal, 'entry-1', { notes: 'Sneaky', version: 1 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
    });

    // EodReviewModal appends its "EOD Review — …" line to `today` after the day
    // locks; blocking that would make a fully-completed day unable to file EOD.
    it('still allows the End of Day review fields on a locked entry', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(lockedEntry);
      prisma.scrumEntry.update.mockResolvedValue({ ...lockedEntry, version: 5 });

      await service.update(principal, 'entry-1', {
        today: 'Call 50 leads\n\nEOD Review — all done',
        blockers: 'None',
        version: 4,
      } as any);

      expect(prisma.scrumEntry.update).toHaveBeenCalled();
    });

    it('leaves a non-locked entry fully editable', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue({ ...lockedEntry, isLocked: false });
      prisma.scrumEntry.update.mockResolvedValue({ ...lockedEntry, isLocked: false, version: 5 });

      await service.update(principal, 'entry-1', { yesterday: 'Rewritten', version: 4 } as any);

      expect(prisma.scrumEntry.update).toHaveBeenCalled();
    });

    it('rejects planning a new task on a locked entry with 403', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(lockedEntry);

      await expect(
        service.createTask(principal, 'entry-1', {
          title: 'Extra work',
          expectedOutput: 'out',
          measurement: 'm',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('unlockEntry reopens the day\'s completed commitments', async () => {
    const supervisor = { ...principal, permissions: ['scrum:read_org'] } as unknown as AuthPrincipal;
    prisma.scrumEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-2',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      isLocked: true,
      entryDate: new Date('2026-07-28'),
    });
    prisma.user.findFirst.mockResolvedValue({ departmentId: 'dept-1' });
    prisma.scrumEntry.update.mockResolvedValue({ id: 'entry-1', isLocked: false });

    await service.unlockEntry(supervisor, 'entry-1', { reason: 'Client changed the target' } as any);

    expect(prisma.scrumTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scrumEntryId: 'entry-1', taskStatus: 'COMPLETED' }),
        data: expect.objectContaining({ taskStatus: 'IN_PROGRESS', completedAt: null }),
      }),
    );
  });
});

describe('ScrumService — carry-over of continued commitments', () => {
  let service: ScrumService;
  let prisma: any;

  const continued = {
    ...baseTask,
    id: 'task-9',
    scrumEntryId: 'entry-yesterday',
    title: 'Call 50 leads',
    taskStatus: 'IN_PROGRESS',
    continueTomorrow: true,
    actualCompleted: '30',
    scrumEntry: { id: 'entry-yesterday', entryDate: new Date('2026-07-29T00:00:00.000Z') },
  };

  beforeEach(async () => {
    prisma = {
      scrumTask: { findMany: jest.fn() },
      scrumEntry: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrumService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: OrgTimeZoneService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') },
        },
      ],
    }).compile();

    service = module.get(ScrumService);
  });

  it('returns the previous day\'s uncompleted "continue tomorrow" commitments', async () => {
    prisma.scrumTask.findMany.mockResolvedValueOnce([continued]);
    prisma.scrumEntry.findFirst.mockResolvedValue(null);

    const result = await service.carryOverTasks(principal);

    expect(result.sourceDate).toBe('2026-07-29');
    expect(result.tasks.map((t) => t.id)).toEqual(['task-9']);
    // The joined entry is stripped — callers get plain ScrumTask rows.
    expect(result.tasks[0]).not.toHaveProperty('scrumEntry');
    expect(prisma.scrumTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          continueTomorrow: true,
          taskStatus: { not: 'COMPLETED' },
        }),
      }),
    );
  });

  it('drops a commitment that has already been re-planned today', async () => {
    prisma.scrumTask.findMany
      .mockResolvedValueOnce([continued])
      .mockResolvedValueOnce([{ title: ' call 50 LEADS ' }]);
    prisma.scrumEntry.findFirst.mockResolvedValue({ id: 'entry-today' });

    const result = await service.carryOverTasks(principal);

    expect(result.tasks).toEqual([]);
    expect(result.sourceEntryId).toBeNull();
  });

  it('returns an empty carry-over when nothing was marked to continue', async () => {
    prisma.scrumTask.findMany.mockResolvedValueOnce([]);

    const result = await service.carryOverTasks(principal);

    expect(result).toEqual({ sourceEntryId: null, sourceDate: null, tasks: [] });
    expect(prisma.scrumEntry.findFirst).not.toHaveBeenCalled();
  });
});

describe('ScrumService — locked-entry edit requests', () => {
  let service: ScrumService;
  let prisma: any;

  const lockedEntry = {
    id: 'entry-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    isLocked: true,
    entryDate: new Date('2026-07-30T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      scrumEntry: { findFirst: jest.fn(), update: jest.fn() },
      scrumEditRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      scrumTask: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
      user: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrumService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: OrgTimeZoneService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') },
        },
      ],
    }).compile();

    service = module.get(ScrumService);
  });

  // BUG-AP follow-up: an unlocked day is exactly where an employee is stuck — the card
  // carries no Edit/Delete, and the day only locks once everything is complete.
  it('accepts an edit request on an entry that is not locked', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue({ ...lockedEntry, isLocked: false });
    prisma.scrumEditRequest.findFirst.mockResolvedValue(null);
    prisma.scrumEditRequest.create.mockResolvedValue({ id: 'req-1', status: 'PENDING' });
    prisma.user.findFirst.mockResolvedValue({ supervisorId: 'sup-1' });

    await service.requestEdit(principal, 'entry-1', { reason: 'Wrong numbers' } as any);

    expect(prisma.scrumEditRequest.create).toHaveBeenCalled();
  });

  it('creates a pending request and notifies the supervisor', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue(lockedEntry);
    prisma.scrumEditRequest.findFirst.mockResolvedValue(null);
    prisma.scrumEditRequest.create.mockResolvedValue({ id: 'req-1', status: 'PENDING' });
    prisma.user.findFirst.mockResolvedValue({ supervisorId: 'sup-1' });

    const result = await service.requestEdit(principal, 'entry-1', { reason: 'Miscounted my calls' } as any);

    expect(result).toEqual({ id: 'req-1', status: 'PENDING' });
    expect(prisma.scrumEditRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scrumEntryId: 'entry-1', requesterId: 'user-1', reason: 'Miscounted my calls' }),
      }),
    );
  });

  // Re-asking must not stack duplicates in the supervisor's queue.
  it('updates the open request instead of creating a second one', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue(lockedEntry);
    prisma.scrumEditRequest.findFirst.mockResolvedValue({ id: 'req-1', status: 'PENDING' });
    prisma.scrumEditRequest.update.mockResolvedValue({ id: 'req-1', status: 'PENDING' });
    prisma.user.findFirst.mockResolvedValue({ supervisorId: 'sup-1' });

    await service.requestEdit(principal, 'entry-1', { reason: 'Adding more detail' } as any);

    expect(prisma.scrumEditRequest.create).not.toHaveBeenCalled();
    expect(prisma.scrumEditRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req-1' } }),
    );
  });

  it('an unlock approves the entry\'s open request', async () => {
    const supervisor = { ...principal, permissions: ['scrum:read_org'] } as unknown as AuthPrincipal;
    prisma.scrumEntry.findFirst.mockResolvedValue({ ...lockedEntry, userId: 'user-2' });
    prisma.user.findFirst.mockResolvedValue({ departmentId: 'dept-1' });
    prisma.scrumEntry.update.mockResolvedValue({ id: 'entry-1', isLocked: false });

    await service.unlockEntry(supervisor, 'entry-1', { reason: 'Approved the correction' } as any);

    expect(prisma.scrumEditRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scrumEntryId: 'entry-1', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'APPROVED', resolvedById: 'user-1' }),
      }),
    );
  });

  // The same supervisor action approves a request on a day that never locked —
  // it just has no unlock to perform (BUG-AP follow-up).
  it('approves an open request on an unlocked entry without touching the entry', async () => {
    const supervisor = { ...principal, permissions: ['scrum:read_org'] } as unknown as AuthPrincipal;
    prisma.scrumEntry.findFirst.mockResolvedValue({ ...lockedEntry, userId: 'user-2', isLocked: false });
    prisma.scrumEditRequest.findFirst.mockResolvedValue({ id: 'req-1', status: 'PENDING' });
    prisma.user.findFirst.mockResolvedValue({ departmentId: 'dept-1' });

    await service.unlockEntry(supervisor, 'entry-1', { reason: 'Go ahead and fix it' } as any);

    expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
    expect(prisma.scrumTask.updateMany).not.toHaveBeenCalled();
    expect(prisma.scrumEditRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('refuses an unlock on an entry that is neither locked nor requested', async () => {
    const supervisor = { ...principal, permissions: ['scrum:read_org'] } as unknown as AuthPrincipal;
    prisma.scrumEntry.findFirst.mockResolvedValue({ ...lockedEntry, userId: 'user-2', isLocked: false });
    prisma.scrumEditRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.unlockEntry(supervisor, 'entry-1', { reason: 'Nothing to do here' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to decline a request outside the supervisor\'s scope', async () => {
    const outsider = { ...principal, permissions: [] } as unknown as AuthPrincipal;
    prisma.scrumEditRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      status: 'PENDING',
      requesterId: 'user-9',
      scrumEntryId: 'entry-1',
    });

    await expect(
      service.declineEditRequest(outsider, 'req-1', { reason: 'Not allowed' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.scrumEditRequest.update).not.toHaveBeenCalled();
  });
});
