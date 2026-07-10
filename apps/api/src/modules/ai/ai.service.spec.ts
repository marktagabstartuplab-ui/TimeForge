import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

const mockPermissiveUser = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  roles: ['admin'],
  permissions: ['ai:trigger_org'],
};

const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

function mockPrisma() {
  const prisma: any = {
    organizationSetting: { findFirst: jest.fn() },
    timesheet: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    payrollPeriod: { findFirst: jest.fn() },
    kpiTemplate: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    aiJob: { create: jest.fn(), findFirst: jest.fn() },
    idempotencyKey: { findFirst: jest.fn(), upsert: jest.fn().mockResolvedValue(undefined) },
  };
  // triggerJob wraps idempotency check + job creation in a transaction; the
  // mock just runs the callback against the same mocked client (tx === prisma).
  prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
  return prisma;
}

describe('AiService', () => {
  let service: AiService;
  let prisma: any;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken('ai'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('checkFeatureEnabled (via triggerJob)', () => {
    it('allows job when no ai.toggles setting exists', async () => {
      prisma.organizationSetting.findFirst.mockResolvedValue(null);
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'pp-1' });
      prisma.aiJob.create.mockResolvedValue({ id: 'job-1' });
      prisma.idempotencyKey.findFirst.mockResolvedValue(null);

      const result = await service.triggerJob(mockPermissiveUser as any, {
        feature: 'PAYROLL_VALIDATION',
        subjectType: 'payroll_period',
        subjectId: 'pp-1',
      } as any, 'idem-1');

      expect(result).toMatchObject({ jobId: 'job-1', status: 'QUEUED' });
    });

    it('allows job when toggle is explicitly true', async () => {
      prisma.organizationSetting.findFirst.mockResolvedValue({
        value: { PAYROLL_VALIDATION: true },
      });
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: 'pp-1' });
      prisma.aiJob.create.mockResolvedValue({ id: 'job-2' });
      prisma.idempotencyKey.findFirst.mockResolvedValue(null);

      const result = await service.triggerJob(mockPermissiveUser as any, {
        feature: 'PAYROLL_VALIDATION',
        subjectType: 'payroll_period',
        subjectId: 'pp-1',
      } as any, 'idem-2');

      expect(result).toMatchObject({ jobId: 'job-2', status: 'QUEUED' });
    });

    it('throws when toggle is explicitly false', async () => {
      prisma.organizationSetting.findFirst.mockResolvedValue({
        value: { PAYROLL_VALIDATION: false },
      });

      await expect(
        service.triggerJob(mockPermissiveUser as any, {
          feature: 'PAYROLL_VALIDATION',
          subjectType: 'payroll_period',
          subjectId: 'pp-1',
        } as any, 'idem-3'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ForbiddenException when user lacks required permission', async () => {
      const noPermUser = { ...mockPermissiveUser, permissions: [] };

      await expect(
        service.triggerJob(noPermUser as any, {
          feature: 'PAYROLL_VALIDATION',
          subjectType: 'payroll_period',
          subjectId: 'pp-1',
        } as any, 'idem-4'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
