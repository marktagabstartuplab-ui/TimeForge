import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { AuthPrincipal } from '../../common/decorators';

const principal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  roles: ['EMPLOYEE'],
  permissions: [],
} as unknown as AuthPrincipal;

const entry = {
  id: 'entry-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  version: 2,
  timesheetId: null,
  startTime: new Date('2026-08-04T01:00:00.000Z'),
  endTime: null,
  projectId: null,
  clientId: null,
  workCategoryId: null,
  departmentId: null,
  description: null,
  task: null,
  deliverables: null,
};

/**
 * BUG-AP — the Work Details form must not be able to save a blank record, and
 * the API is the backstop for that, not just the form.
 */
describe('TimeTrackingService — Work Details completeness', () => {
  let service: TimeTrackingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      timeEntry: { findFirst: jest.fn().mockResolvedValue(entry), update: jest.fn() },
      workCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeTrackingService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: DepartmentScopeService, useValue: {} },
      ],
    }).compile();

    service = module.get(TimeTrackingService);
  });

  it('rejects a work-details save that is missing the mandatory fields', async () => {
    await expect(
      service.update(principal, 'entry-1', { deliverables: 'Merged PR #142', version: 2 } as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only values', async () => {
    await expect(
      service.update(principal, 'entry-1', {
        task: '   ',
        description: 'Reviewed the payroll export',
        workCategoryId: 'cat-1',
        version: 2,
      } as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('accepts a complete work-details save', async () => {
    prisma.timeEntry.update.mockResolvedValue({ ...entry, version: 3 });

    await service.update(principal, 'entry-1', {
      task: 'UI refactoring',
      description: 'Reworked the Work Details card',
      workCategoryId: 'cat-1',
      version: 2,
    } as any);

    expect(prisma.timeEntry.update).toHaveBeenCalled();
  });

  it('leaves PATCHes that do not touch work details alone', async () => {
    prisma.timeEntry.update.mockResolvedValue({ ...entry, version: 3 });

    await service.update(principal, 'entry-1', {
      endTime: '2026-08-04T05:00:00.000Z',
      version: 2,
    } as any);

    expect(prisma.timeEntry.update).toHaveBeenCalled();
  });
});
