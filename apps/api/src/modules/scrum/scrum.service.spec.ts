import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
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
