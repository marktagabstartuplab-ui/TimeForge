import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TimesheetAdjustmentsService } from './timesheet-adjustments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

const SUPERVISOR: AuthPrincipal = {
  userId: 'sup-1',
  tenantId: 't-1',
  organizationId: 'o-1',
  roles: ['SUPERVISOR'],
  permissions: ['timesheet:adjust_team', 'approval:decide', 'timesheet:read_team'],
};

/** A 12h entry — the "forgot to clock out" case BUG-Q describes. */
function baseSheet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ts-1',
    userId: 'emp-1',
    tenantId: 't-1',
    organizationId: 'o-1',
    status: 'SUBMITTED',
    version: 3,
    totalMinutes: 720,
    overtimeMinutesOverride: null,
    entries: [
      {
        id: 'e-1',
        startTime: new Date('2026-07-20T09:00:00.000Z'),
        endTime: new Date('2026-07-20T21:00:00.000Z'),
        durationMinutes: 720,
      },
    ],
    ...overrides,
  };
}

describe('TimesheetAdjustmentsService', () => {
  let service: TimesheetAdjustmentsService;
  let prisma: {
    timesheet: { findFirst: jest.Mock; update: jest.Mock };
    timeEntry: { update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      timesheet: {
        findFirst: jest.fn().mockResolvedValue(baseSheet()),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'ts-1', ...data })),
      },
      timeEntry: { update: jest.fn().mockImplementation(({ where }) => ({ id: where.id })) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    };
    notifications = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetAdjustmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: DepartmentScopeService,
          useValue: { teamUserIds: jest.fn().mockResolvedValue(['emp-1']) },
        },
        {
          provide: OrgTimeZoneService,
          useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') },
        },
      ],
    }).compile();

    service = module.get(TimesheetAdjustmentsService);
  });

  const adjustTo8h = {
    expectedVersion: 3,
    reason: 'Employee forgot to clock out; confirmed 9am-5pm.',
    entries: [{ entryId: 'e-1', endTime: '2026-07-20T17:00:00.000Z' }],
  };

  describe('guards', () => {
    it('refuses a blank reason', async () => {
      await expect(
        service.adjust(SUPERVISOR, 'ts-1', { ...adjustTo8h, reason: '   ' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to let a supervisor adjust their own timesheet', async () => {
      prisma.timesheet.findFirst.mockResolvedValue(baseSheet({ userId: SUPERVISOR.userId }));
      await expect(service.adjust(SUPERVISOR, 'ts-1', adjustTo8h)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a timesheet that is no longer under review', async () => {
      prisma.timesheet.findFirst.mockResolvedValue(baseSheet({ status: 'APPROVED' }));
      await expect(service.adjust(SUPERVISOR, 'ts-1', adjustTo8h)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a stale expectedVersion', async () => {
      await expect(
        service.adjust(SUPERVISOR, 'ts-1', { ...adjustTo8h, expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an entry that belongs to another timesheet', async () => {
      await expect(
        service.adjust(SUPERVISOR, 'ts-1', {
          ...adjustTo8h,
          entries: [{ entryId: 'e-not-mine', durationMinutes: 60 }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses a Time Out that precedes Time In', async () => {
      await expect(
        service.adjust(SUPERVISOR, 'ts-1', {
          ...adjustTo8h,
          entries: [{ entryId: 'e-1', endTime: '2026-07-20T08:00:00.000Z' }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses overtime larger than the adjusted total', async () => {
      await expect(
        service.adjust(SUPERVISOR, 'ts-1', { ...adjustTo8h, overtimeMinutesOverride: 600 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('adjustment', () => {
    it('recomputes the entry duration and the timesheet total from the new Time Out', async () => {
      await service.adjust(SUPERVISOR, 'ts-1', adjustTo8h);

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e-1' },
          data: expect.objectContaining({
            endTime: new Date('2026-07-20T17:00:00.000Z'),
            durationMinutes: 480,
            updatedBy: 'sup-1',
          }),
        }),
      );
      expect(prisma.timesheet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalMinutes: 480, updatedBy: 'sup-1' }),
        }),
      );
    });

    it('takes an explicit Total Hours over the clock-time span', async () => {
      await service.adjust(SUPERVISOR, 'ts-1', {
        expectedVersion: 3,
        reason: 'Unlogged 1h lunch deducted.',
        entries: [{ entryId: 'e-1', durationMinutes: 420 }],
      });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ durationMinutes: 420 }) }),
      );
      expect(prisma.timesheet.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalMinutes: 420 }) }),
      );
    });

    it('writes a TIME_ADJUSTMENT audit record with before/after, supervisor and reason', async () => {
      await service.adjust(SUPERVISOR, 'ts-1', adjustTo8h);

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data).toMatchObject({
        tenantId: 't-1',
        actorId: 'sup-1',
        action: 'TIME_ADJUSTMENT',
        entityType: 'timesheet',
        entityId: 'ts-1',
      });
      expect(data.metadata).toMatchObject({
        event: 'SUPERVISOR_TIME_ADJUSTMENT',
        reason: 'Employee forgot to clock out; confirmed 9am-5pm.',
        supervisorId: 'sup-1',
        employeeId: 'emp-1',
        // 12h logged -> 4h of it was overtime; corrected to a flat 8h day.
        before: { totalMinutes: 720, overtimeMinutes: 240 },
        after: { totalMinutes: 480, overtimeMinutes: 0 },
      });
      expect(data.metadata.before.entries).toEqual([
        {
          id: 'e-1',
          startTime: '2026-07-20T09:00:00.000Z',
          endTime: '2026-07-20T21:00:00.000Z',
          durationMinutes: 720,
        },
      ]);
      expect(data.metadata.after.entries).toEqual([
        {
          id: 'e-1',
          startTime: '2026-07-20T09:00:00.000Z',
          endTime: '2026-07-20T17:00:00.000Z',
          durationMinutes: 480,
        },
      ]);
    });

    it('persists an explicit overtime override in place of the derived >8h/day figure', async () => {
      const result = await service.adjust(SUPERVISOR, 'ts-1', {
        expectedVersion: 3,
        reason: 'Only 1h of the overtime was pre-authorised.',
        overtimeMinutesOverride: 60,
      });

      expect(prisma.timesheet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalMinutes: 720, overtimeMinutesOverride: 60 }),
        }),
      );
      expect(result.overtimeMinutes).toBe(60);
    });

    it('clears the override and returns to derived overtime when sent null', async () => {
      prisma.timesheet.findFirst.mockResolvedValue(baseSheet({ overtimeMinutesOverride: 60 }));

      const result = await service.adjust(SUPERVISOR, 'ts-1', {
        expectedVersion: 3,
        reason: 'Override applied in error.',
        overtimeMinutesOverride: null,
      });

      expect(prisma.timesheet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overtimeMinutesOverride: null }),
        }),
      );
      expect(result.overtimeMinutes).toBe(240);
    });

    it('runs the entry, timesheet and audit writes in one transaction', async () => {
      await service.adjust(SUPERVISOR, 'ts-1', adjustTo8h);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
    });

    it('notifies the employee that their record was changed', async () => {
      await service.adjust(SUPERVISOR, 'ts-1', adjustTo8h);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'emp-1',
          senderId: 'sup-1',
          type: 'TIME_ADJUSTED',
          category: 'TIMESHEETS',
        }),
      );
      expect(notifications.create.mock.calls[0][0].message).toContain(
        'Employee forgot to clock out',
      );
    });
  });
});
