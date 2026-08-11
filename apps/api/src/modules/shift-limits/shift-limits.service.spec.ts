import { Test, TestingModule } from '@nestjs/testing';
import { ShiftLimitsService } from './shift-limits.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthPrincipal } from '../../common/decorators';

const HOUR = 60 * 60_000;

const CONFIG = {
  id: 'config-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  shiftName: 'Standard',
  maxShiftMinutes: 720, // 12h
  gracePeriodMinutes: 0,
  warningLeadMinutes: 60, // warn from 11h
  requiresSupervisorOverride: true,
  isDefault: true,
} as never;

const CLOCK_IN = new Date('2026-08-01T00:00:00.000Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'employee-1',
    clockIn: CLOCK_IN,
    isActive: true,
    breakMinutes: 0,
    currentBreakStartedAt: null,
    shiftConfigurationId: 'config-1',
    maxClockOutAt: new Date(CLOCK_IN.getTime() + 12 * HOUR),
    requiresOverride: false,
    ...overrides,
  } as never;
}

describe('ShiftLimitsService', () => {
  let service: ShiftLimitsService;
  let prisma: {
    shiftConfiguration: Record<string, jest.Mock>;
    shiftLimitViolation: Record<string, jest.Mock>;
    workSession: Record<string, jest.Mock>;
    timeEntry: Record<string, jest.Mock>;
    sessionEvent: Record<string, jest.Mock>;
    auditLog: Record<string, jest.Mock>;
    notification: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
  };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      shiftConfiguration: {
        findUnique: jest.fn().mockResolvedValue(CONFIG),
        findFirst: jest.fn().mockResolvedValue(CONFIG),
        create: jest.fn(),
        update: jest.fn(),
      },
      shiftLimitViolation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'violation-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'violation-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      workSession: {
        findFirst: jest.fn().mockResolvedValue(makeSession()),
        findUnique: jest.fn().mockResolvedValue(makeSession()),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      sessionEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ supervisorId: 'supervisor-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftLimitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ShiftLimitsService);
  });

  describe('updateConfig — the daily cap on a first-time save', () => {
    const admin = {
      userId: 'admin-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      roles: ['ADMIN'],
      permissions: ['*'],
    } as never;

    /**
     * An org with no configuration row yet: the first save creates one. It must
     * not carry an explicit null daily cap, because null falls back to
     * maxShiftMinutes and would hand that org a silent 12-hour day. Leaving the
     * field off lets the column default (480) apply.
     */
    it('does not write an explicit null daily cap when creating the row', async () => {
      prisma.shiftConfiguration.findFirst.mockResolvedValue(null);
      prisma.shiftConfiguration.create.mockImplementation(({ data }: never) => ({
        id: 'cfg-new',
        ...(data as object),
      }));

      await service.updateConfig(admin, { maxShiftMinutes: 720 });

      const { data } = prisma.shiftConfiguration.create.mock.calls[0][0];
      expect(data.maxDailyMinutes).toBeUndefined();
    });

    it('persists a daily cap the admin sets explicitly', async () => {
      prisma.shiftConfiguration.findFirst.mockResolvedValue(null);
      prisma.shiftConfiguration.create.mockImplementation(({ data }: never) => ({
        id: 'cfg-new',
        ...(data as object),
      }));

      await service.updateConfig(admin, { maxDailyMinutes: 600 });

      expect(prisma.shiftConfiguration.create.mock.calls[0][0].data.maxDailyMinutes).toBe(600);
    });

    // Null is the documented way to opt back into the maxShiftMinutes fallback,
    // so it has to survive rather than being read as "not supplied".
    it('lets an explicit null clear the cap on an existing row', async () => {
      prisma.shiftConfiguration.findFirst.mockResolvedValue({ id: 'cfg-1', maxDailyMinutes: 480 });
      prisma.shiftConfiguration.update.mockImplementation(({ data }: never) => ({
        id: 'cfg-1',
        ...(data as object),
      }));

      await service.updateConfig(admin, { maxDailyMinutes: null });

      expect(prisma.shiftConfiguration.update.mock.calls[0][0].data.maxDailyMinutes).toBeNull();
    });
  });

  describe('status', () => {
    it('is OK before the warning window', async () => {
      const status = await service.status(makeSession(), new Date(CLOCK_IN.getTime() + 5 * HOUR));
      expect(status.state).toBe('OK');
      expect(status.remainingMinutes).toBe(7 * 60);
    });

    it('warns at 11 hours', async () => {
      const status = await service.status(makeSession(), new Date(CLOCK_IN.getTime() + 11 * HOUR));
      expect(status.state).toBe('WARNING');
      expect(status.elapsedMinutes).toBe(11 * 60);
    });

    it('reports LIMIT_REACHED exactly at 12 hours', async () => {
      const status = await service.status(makeSession(), new Date(CLOCK_IN.getTime() + 12 * HOUR));
      expect(status.state).toBe('EXPIRED'); // grace is 0, so limit and grace-end coincide
      expect(status.remainingMinutes).toBe(0);
    });

    it('stays inside the grace period before expiring', async () => {
      prisma.shiftConfiguration.findUnique.mockResolvedValue({ ...(CONFIG as object), gracePeriodMinutes: 15 });
      const at12h05 = new Date(CLOCK_IN.getTime() + 12 * HOUR + 5 * 60_000);
      expect((await service.status(makeSession(), at12h05)).state).toBe('LIMIT_REACHED');

      const at12h20 = new Date(CLOCK_IN.getTime() + 12 * HOUR + 20 * 60_000);
      expect((await service.status(makeSession(), at12h20)).state).toBe('EXPIRED');
    });

    it('reports the EXTENDED limit, not the org default, after an override', async () => {
      // Caught in the browser: the UI read "SHIFT LIMIT — 12H … 42M LEFT" while
      // showing 12h18m elapsed, because the config value was reported instead of
      // the session's actual deadline.
      const extended = makeSession({ maxClockOutAt: new Date(CLOCK_IN.getTime() + 13 * HOUR) });
      const status = await service.status(extended, new Date(CLOCK_IN.getTime() + 12.2 * HOUR));

      expect(status.maxShiftMinutes).toBe(13 * 60);
      expect(status.elapsedMinutes).toBeLessThan(status.maxShiftMinutes!);
      expect(status.remainingMinutes).toBe(48);
      expect(status.state).toBe('WARNING');
    });

    it('treats a session with no configuration as unlimited', async () => {
      const status = await service.status(
        makeSession({ shiftConfigurationId: null, maxClockOutAt: null }),
        new Date(CLOCK_IN.getTime() + 20 * HOUR),
      );
      expect(status.state).toBe('UNLIMITED');
      expect(status.remainingMinutes).toBeNull();
    });

    it('measures elapsed wall-clock time, so breaks do not extend the shift', async () => {
      const status = await service.status(
        makeSession({ breakMinutes: 120 }),
        new Date(CLOCK_IN.getTime() + 12 * HOUR),
      );
      expect(status.elapsedMinutes).toBe(12 * 60);
      expect(status.state).toBe('EXPIRED');
    });
  });

  describe('evaluateAndNotify', () => {
    it('warns the employee once inside the warning window', async () => {
      await service.evaluateAndNotify(makeSession(), new Date(CLOCK_IN.getTime() + 11 * HOUR));
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create.mock.calls[0][0]).toMatchObject({
        type: 'SHIFT_LIMIT_WARNING',
        userId: 'employee-1',
      });
    });

    it('does not re-warn when a warning already exists for this session', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'notification-1' });
      await service.evaluateAndNotify(makeSession(), new Date(CLOCK_IN.getTime() + 11 * HOUR));
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('records REACHED_LIMIT once and flags the session for override', async () => {
      await service.evaluateAndNotify(makeSession(), new Date(CLOCK_IN.getTime() + 12 * HOUR));

      expect(prisma.shiftLimitViolation.create).toHaveBeenCalledTimes(1);
      expect(prisma.shiftLimitViolation.create.mock.calls[0][0].data).toMatchObject({
        violationType: 'REACHED_LIMIT',
        minutesWorkedAtViolation: 720,
      });
      expect(prisma.workSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiresOverride: true }) }),
      );
    });

    it('does not duplicate the REACHED_LIMIT row on a second sweep', async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({ id: 'existing' });
      await service.evaluateAndNotify(makeSession(), new Date(CLOCK_IN.getTime() + 12 * HOUR));
      expect(prisma.shiftLimitViolation.create).not.toHaveBeenCalled();
    });

    it('records a fresh crossing after a supervisor extends the deadline', async () => {
      // The 12h crossing is already on file; the deadline is now 13h.
      prisma.shiftLimitViolation.findFirst.mockImplementation(({ where }) =>
        where.violationType === 'REACHED_LIMIT' &&
        where.violationAt?.getTime() === CLOCK_IN.getTime() + 12 * HOUR
          ? { id: 'first-crossing' }
          : null,
      );
      const extended = makeSession({ maxClockOutAt: new Date(CLOCK_IN.getTime() + 13 * HOUR) });

      await service.evaluateAndNotify(extended, new Date(CLOCK_IN.getTime() + 13 * HOUR));

      // Keyed per-deadline, so the extended limit is audited too.
      expect(prisma.shiftLimitViolation.create).toHaveBeenCalledTimes(1);
      expect(prisma.shiftLimitViolation.create.mock.calls[0][0].data).toMatchObject({
        violationType: 'REACHED_LIMIT',
        violationAt: new Date(CLOCK_IN.getTime() + 13 * HOUR),
      });
    });

    it('re-warns inside the extended window rather than staying silent', async () => {
      // A warning was already sent against the original 12h deadline.
      prisma.notification.findFirst.mockImplementation(({ where }) =>
        where.AND[0].metadata.equals.endsWith(new Date(CLOCK_IN.getTime() + 12 * HOUR).toISOString())
          ? { id: 'old-warning' }
          : null,
      );
      const extended = makeSession({ maxClockOutAt: new Date(CLOCK_IN.getTime() + 13 * HOUR) });

      await service.evaluateAndNotify(extended, new Date(CLOCK_IN.getTime() + 12.5 * HOUR));

      expect(notifications.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('autoClockOut', () => {
    it('clocks out at the deadline, not at the (later) current time', async () => {
      const deadline = new Date(CLOCK_IN.getTime() + 12 * HOUR);
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'entry-1', startTime: CLOCK_IN });

      const closed = await service.autoClockOut(makeSession());

      expect(closed).toBe(true);
      // The running segment is truncated at exactly 12h — nothing past the limit.
      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ endTime: deadline, durationMinutes: 720 }) }),
      );
      expect(prisma.workSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1', isActive: true },
          data: expect.objectContaining({ clockOut: deadline, isActive: false, isAutoClockedOut: true }),
        }),
      );
      expect(prisma.shiftLimitViolation.create.mock.calls[0][0].data).toMatchObject({
        violationType: 'AUTO_CLOCKED_OUT',
        minutesWorkedAtViolation: 720,
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('notifies both the employee and their supervisor', async () => {
      await service.autoClockOut(makeSession());
      const recipients = notifications.create.mock.calls.map((c) => c[0].userId);
      expect(recipients).toEqual(['employee-1', 'supervisor-1']);
    });

    it('is a no-op when the session was already closed by a real clock-out', async () => {
      prisma.workSession.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.autoClockOut(makeSession())).toBe(false);
      expect(prisma.sessionEvent.create).not.toHaveBeenCalled();
    });

    it('refuses to close an unlimited session', async () => {
      expect(await service.autoClockOut(makeSession({ maxClockOutAt: null }))).toBe(false);
    });
  });

  describe('override workflow', () => {
    const employee = {
      userId: 'employee-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      permissions: [],
    } as unknown as AuthPrincipal;

    const supervisor = {
      userId: 'supervisor-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      permissions: ['shift_override:approve'],
    } as unknown as AuthPrincipal;

    it('creates a request and notifies the supervisor', async () => {
      await service.requestOverride(employee, { additionalMinutes: 60, reason: 'Release night' });

      expect(prisma.shiftLimitViolation.create.mock.calls[0][0].data).toMatchObject({
        violationType: 'MANUAL_OVERRIDE',
        requestedExtensionMinutes: 60,
      });
      expect(notifications.create.mock.calls[0][0]).toMatchObject({
        type: 'SHIFT_OVERRIDE_REQUESTED',
        userId: 'supervisor-1',
      });
    });

    it('rejects a second request while one is pending', async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({ id: 'pending-1' });
      await expect(service.requestOverride(employee, { additionalMinutes: 60 })).rejects.toThrow(
        'already awaiting a decision',
      );
    });

    it('rejects a request when the employee has no supervisor', async () => {
      prisma.user.findUnique.mockResolvedValue({ supervisorId: null });
      await expect(service.requestOverride(employee, { additionalMinutes: 60 })).rejects.toThrow(
        'no assigned supervisor',
      );
    });

    it('extends the deadline by exactly one hour when approved', async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({
        id: 'violation-1',
        employeeId: 'employee-1',
        workSessionId: 'session-1',
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'NO_ACTION',
        requestedExtensionMinutes: 60,
      });

      await service.decideOverride(supervisor, 'violation-1', { approved: true });

      expect(prisma.workSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // 12h deadline + 1h extension = 13h after clock-in
            maxClockOutAt: new Date(CLOCK_IN.getTime() + 13 * HOUR),
            overrideApproved: true,
            requiresOverride: false,
          }),
        }),
      );
      expect(notifications.create.mock.calls[0][0]).toMatchObject({
        type: 'SHIFT_OVERRIDE_DECISION',
        userId: 'employee-1',
        title: 'Shift extension approved',
      });
    });

    it('lets a supervisor grant less than was requested', async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({
        id: 'violation-1',
        employeeId: 'employee-1',
        workSessionId: 'session-1',
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'NO_ACTION',
        requestedExtensionMinutes: 240,
      });

      await service.decideOverride(supervisor, 'violation-1', { approved: true, additionalMinutes: 30 });

      expect(prisma.workSession.update.mock.calls[0][0].data.maxClockOutAt).toEqual(
        new Date(CLOCK_IN.getTime() + 12 * HOUR + 30 * 60_000),
      );
    });

    it('does not extend the deadline when denied', async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({
        id: 'violation-1',
        employeeId: 'employee-1',
        workSessionId: 'session-1',
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'NO_ACTION',
        requestedExtensionMinutes: 60,
      });

      await service.decideOverride(supervisor, 'violation-1', { approved: false, note: 'Go home' });

      expect(prisma.workSession.update).not.toHaveBeenCalled();
      expect(prisma.shiftLimitViolation.update.mock.calls[0][0].data).toMatchObject({
        supervisorAction: 'DENIED',
        supervisorId: 'supervisor-1',
      });
    });

    it('rejects a decision on an already-decided request', async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({
        id: 'violation-1',
        employeeId: 'employee-1',
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'APPROVED',
      });
      await expect(
        service.decideOverride(supervisor, 'violation-1', { approved: true }),
      ).rejects.toThrow('already been decided');
    });

    it("rejects a decision on someone else's report", async () => {
      prisma.shiftLimitViolation.findFirst.mockResolvedValue({
        id: 'violation-1',
        employeeId: 'stranger-1',
        violationType: 'MANUAL_OVERRIDE',
        supervisorAction: 'NO_ACTION',
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.decideOverride(supervisor, 'violation-1', { approved: true }),
      ).rejects.toThrow('your own team');
    });
  });

  describe('listViolations', () => {
    it('denies a caller with neither team nor org read permission', async () => {
      const employee = {
        userId: 'employee-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        permissions: ['shift_config:read'],
      } as unknown as AuthPrincipal;

      await expect(service.listViolations(employee, {})).rejects.toThrow(
        'shift_violation:read_team',
      );
    });

    it('scopes a supervisor to their own direct reports', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'employee-1' }, { id: 'employee-2' }]);
      const supervisor = {
        userId: 'supervisor-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        permissions: ['shift_violation:read_team'],
      } as unknown as AuthPrincipal;

      await service.listViolations(supervisor, {});

      expect(prisma.shiftLimitViolation.findMany.mock.calls[0][0].where.employeeId).toEqual({
        in: ['employee-1', 'employee-2'],
      });
    });

    it('does not restrict an org-wide reader by employee', async () => {
      const hr = {
        userId: 'hr-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        permissions: ['shift_violation:read_org'],
      } as unknown as AuthPrincipal;

      await service.listViolations(hr, {});

      expect(prisma.shiftLimitViolation.findMany.mock.calls[0][0].where.employeeId).toBeUndefined();
    });
  });
});
