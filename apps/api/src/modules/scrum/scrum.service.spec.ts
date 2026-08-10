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

  // BUG-BP — saving the daily plan locks the plan itself. Distinct from BUG-AE's
  // whole-day lock: the day stays open (the EOD review still files results), but
  // commitments, blockers and the plan's own text fields are frozen.
  describe('BUG-BP — saved plan is locked', () => {
    const planLockedEntry = {
      id: 'entry-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      isLocked: false,
      planLockedAt: new Date('2026-08-07T01:00:00Z'),
      version: 4,
      yesterday: 'Shipped the report',
      today: 'Call 50 leads',
      blockers: null,
      notes: null,
      progress: 0,
      status: 'NOT_STARTED',
    };
    const openEntry = { ...planLockedEntry, planLockedAt: null };

    beforeEach(() => {
      prisma.scrumEditRequest.findFirst.mockResolvedValue(null);
    });

    it('stamps planLockedAt on the first plan save', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(openEntry);
      prisma.scrumEntry.update.mockResolvedValue({ ...openEntry, version: 5 });

      await service.update(principal, 'entry-1', { yesterday: 'Rewritten', version: 4 } as any);

      const [{ data }] = prisma.scrumEntry.update.mock.calls.at(-1)!;
      expect(data.planLockedAt).toBeInstanceOf(Date);
    });

    it('rejects editing the plan again after it locks, even on a current version', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);

      await expect(
        service.update(principal, 'entry-1', { yesterday: 'Rewritten', version: 4 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
    });

    it('rejects adding a commitment to a locked plan', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);

      await expect(
        service.createTask(principal, 'entry-1', {
          title: 'Snuck in later',
          expectedOutput: 'out',
          measurement: 'm',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects adding a blocker to a locked plan', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);

      await expect(
        service.createBlocker(principal, 'entry-1', { title: 'Mid-day blocker' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects rewriting a commitment on a locked plan', async () => {
      prisma.scrumTask.findFirst.mockResolvedValue({ ...baseTask, taskStatus: 'IN_PROGRESS', completedAt: null });
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);

      await expect(
        service.updateTask(principal, 'task-1', { title: 'Rewritten', version: 3 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.scrumTask.update).not.toHaveBeenCalled();
    });

    // The whole point of the split lock: results still land after submission.
    it('still allows the EOD result-only update on a locked plan', async () => {
      prisma.scrumTask.findFirst.mockResolvedValue({ ...baseTask, taskStatus: 'IN_PROGRESS', completedAt: null });
      prisma.scrumTask.update.mockResolvedValue({ ...baseTask, actualCompleted: '55' });
      prisma.scrumTask.findMany.mockResolvedValue([{ taskStatus: 'IN_PROGRESS' }]);
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);
      prisma.scrumEntry.update.mockResolvedValue({});

      await service.updateTask(principal, 'task-1', { actualCompleted: '55', version: 3 } as any);

      expect(prisma.scrumTask.update).toHaveBeenCalled();
    });

    it('still allows the EOD entry fields on a locked plan', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);
      prisma.scrumEntry.update.mockResolvedValue({ ...planLockedEntry, version: 5 });

      await service.update(principal, 'entry-1', {
        today: 'Call 50 leads\n\nEOD Review — all done',
        version: 4,
      } as any);

      expect(prisma.scrumEntry.update).toHaveBeenCalled();
    });

    it('reopens the plan once the supervisor approves an edit request', async () => {
      prisma.scrumEntry.findFirst.mockResolvedValue(planLockedEntry);
      prisma.scrumEditRequest.findFirst.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });
      prisma.scrumEntry.update.mockResolvedValue({ ...planLockedEntry, version: 5 });

      await service.update(principal, 'entry-1', { yesterday: 'Corrected', version: 4 } as any);

      expect(prisma.scrumEntry.update).toHaveBeenCalled();
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

/**
 * BUG-BV — Task Progress on a commitment. The gap this closes is between
 * "Not Started" and "Completed": a task carried across several days needs to be
 * able to say it is 80% done. Null is a distinct third state — never rated —
 * and must not collapse into 0%.
 */
describe('ScrumService — task completion percentage', () => {
  let service: ScrumService;
  let prisma: any;

  const openEntry = {
    id: 'entry-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    isLocked: false,
    planLockedAt: null,
    submittedAt: null,
    version: 1,
  };

  const openTask = { ...baseTask, taskStatus: 'IN_PROGRESS', completedAt: null, completionPercentage: 50 };

  beforeEach(async () => {
    prisma = {
      scrumTask: {
        findFirst: jest.fn().mockResolvedValue(openTask),
        create: jest.fn((args: any) => ({ id: 'task-new', ...args.data })),
        update: jest.fn((args: any) => ({ id: 'task-1', ...args.data })),
        findMany: jest.fn().mockResolvedValue([{ taskStatus: 'IN_PROGRESS' }]),
      },
      scrumEntry: { findFirst: jest.fn().mockResolvedValue(openEntry), update: jest.fn() },
      scrumEditRequest: { findFirst: jest.fn().mockResolvedValue(null) },
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

  it('stores the progress a carried-over commitment was planned with', async () => {
    await service.createTask(principal, 'entry-1', {
      title: 'Finish the migration',
      expectedOutput: 'Migration merged',
      measurement: 'Merged PR',
      completionPercentage: 75,
    } as any);

    const [{ data }] = prisma.scrumTask.create.mock.calls.at(-1)!;
    expect(data.completionPercentage).toBe(75);
  });

  // Null, not 0 — "I never rated this" is a different claim from "none of this
  // is done", and the supervisor view keys off exactly that distinction.
  it('leaves progress null on a task planned without one', async () => {
    await service.createTask(principal, 'entry-1', {
      title: 'Ad-hoc task',
      expectedOutput: '',
      measurement: '',
    } as any);

    const [{ data }] = prisma.scrumTask.create.mock.calls.at(-1)!;
    expect(data.completionPercentage).toBeNull();
  });

  it('updates progress as the multi-day task advances', async () => {
    await service.updateTask(principal, 'task-1', { completionPercentage: 100, version: 3 } as any);

    const [{ data }] = prisma.scrumTask.update.mock.calls.at(-1)!;
    expect(data.completionPercentage).toBe(100);
  });

  it('preserves the stored progress when the update does not mention it', async () => {
    await service.updateTask(principal, 'task-1', { title: 'Renamed', version: 3 } as any);

    const [{ data }] = prisma.scrumTask.update.mock.calls.at(-1)!;
    expect(data.completionPercentage).toBe(50);
  });

  // Progress is plan data, deliberately kept out of EOD_REPORT_FIELDS: it must
  // be frozen by the plan lock like the rest of the plan, not slip through the
  // result-only escape hatch the End of Day review uses.
  it('refuses a progress edit once the plan is locked', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue({
      ...openEntry,
      planLockedAt: new Date('2026-08-09T01:00:00Z'),
    });

    await expect(
      service.updateTask(principal, 'task-1', { completionPercentage: 100, version: 3 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.scrumTask.update).not.toHaveBeenCalled();
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

/**
 * BUG-AQ / BUG-AR — the revision workflow's exit (resubmit) and the supervisor
 * comment's dismiss/delete actions.
 */
describe('ScrumService — resubmission and comment dismissal', () => {
  let service: ScrumService;
  let prisma: any;

  const unlockedEntry = {
    id: 'entry-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    isLocked: false,
    version: 4,
    progress: 50,
    status: 'IN_PROGRESS',
    entryDate: new Date('2026-07-30T00:00:00.000Z'),
    supervisorNote: 'Please add the client name.',
    supervisorNoteDismissedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      scrumTask: { findMany: jest.fn().mockResolvedValue([]) },
      scrumEntry: { findFirst: jest.fn(), update: jest.fn((args: any) => args.data) },
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

  it('locks the entry again on resubmit', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue(unlockedEntry);

    await service.resubmitEntry(principal, 'entry-1');

    expect(prisma.scrumEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isLocked: true, submittedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ event: 'SCRUM_ENTRY_RESUBMITTED' }),
        }),
      }),
    );
  });

  it('does not claim completion when the commitments are unfinished', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue(unlockedEntry);
    prisma.scrumTask.findMany.mockResolvedValue([
      { taskStatus: 'COMPLETED' },
      { taskStatus: 'IN_PROGRESS' },
    ]);

    await service.resubmitEntry(principal, 'entry-1');

    expect(prisma.scrumEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ progress: 50, status: 'IN_PROGRESS' }),
      }),
    );
  });

  it('refuses to resubmit an entry that is already locked', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue({ ...unlockedEntry, isLocked: true });

    await expect(service.resubmitEntry(principal, 'entry-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
  });

  it('dismisses a comment without erasing it, so history keeps the text', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue(unlockedEntry);

    await service.dismissComment(principal, 'entry-1');

    const { data } = prisma.scrumEntry.update.mock.calls[0][0];
    expect(data.supervisorNoteDismissedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('supervisorNote');
  });

  it('refuses a comment delete from someone without team scope', async () => {
    prisma.scrumEntry.findFirst.mockResolvedValue({ ...unlockedEntry, userId: 'user-2' });

    await expect(service.deleteComment(principal, 'entry-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
  });
});
