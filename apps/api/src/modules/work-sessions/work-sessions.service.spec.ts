import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkSessionsService } from './work-sessions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { ShiftLimitsService } from '../shift-limits/shift-limits.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * BUG-BX — split shifts. A day is many sessions; what bounds it is cumulative
 * worked time, not "a session already ended".
 */
describe('WorkSessionsService — multiple sessions per day', () => {
  let service: WorkSessionsService;
  let prisma: any;

  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: [],
  } as unknown as AuthPrincipal;

  /** Minutes of closed work already logged today, as time-entry rows. */
  const loggedToday = (...durations: number[]) =>
    durations.map((durationMinutes, i) => ({
      id: `entry-${i}`,
      startTime: new Date('2026-08-09T01:00:00.000Z'),
      endTime: new Date('2026-08-09T02:00:00.000Z'),
      durationMinutes,
    }));

  const build = async (opts: {
    priorSessions?: number;
    entries?: any[];
    maxShiftMinutes?: number | null;
    /** The org's separate daily cap; omitted means unset, which falls back. */
    maxDailyMinutes?: number | null;
    scrumEntry?: any;
  }) => {
    const sessions = Array.from({ length: opts.priorSessions ?? 0 }, (_, i) => ({ id: `s-${i}` }));
    prisma = {
      workSession: {
        findFirst: jest.fn().mockResolvedValue(null), // no active session
        findMany: jest.fn().mockResolvedValue(sessions),
        count: jest.fn().mockResolvedValue(sessions.length),
        create: jest.fn().mockResolvedValue({ id: 'new-session' }),
      },
      timeEntry: { findMany: jest.fn().mockResolvedValue(opts.entries ?? []), create: jest.fn() },
      sessionEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      scrumEntry: {
        findFirst: jest.fn().mockResolvedValue(opts.scrumEntry ?? null),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') } },
        {
          provide: ShiftLimitsService,
          useValue: {
            defaultConfig: jest.fn().mockResolvedValue(
              opts.maxShiftMinutes === null
                ? null
                : {
                    id: 'cfg-1',
                    maxShiftMinutes: opts.maxShiftMinutes ?? 720,
                    maxDailyMinutes: opts.maxDailyMinutes ?? null,
                  },
            ),
            deadlineFor: jest.fn().mockReturnValue(new Date('2026-08-09T22:00:00.000Z')),
            evaluateAndNotify: jest.fn(),
            autoClockOut: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WorkSessionsService);
    return prisma;
  };

  // The headline regression: this used to throw "Today's work session is
  // complete. New sessions are available from tomorrow."
  it('allows a second session after an earlier one was closed', async () => {
    await build({ priorSessions: 1, entries: loggedToday(300) }); // 5h done

    await expect(service.clockIn(principal, {} as never)).resolves.toBeDefined();
    expect(prisma.workSession.create).toHaveBeenCalled();
  });

  it('refuses a new session once the cumulative daily limit is spent', async () => {
    await build({ priorSessions: 1, entries: loggedToday(720) }); // 12h of 12h

    await expect(service.clockIn(principal, {} as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.workSession.create).not.toHaveBeenCalled();
  });

  it('counts hours across every session of the day, not just the last one', async () => {
    // 4h morning + 4h afternoon + 4h evening = 12h, spread over three sessions.
    await build({ priorSessions: 3, entries: loggedToday(240, 240, 240) });

    await expect(service.clockIn(principal, {} as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('still refuses a second concurrent session', async () => {
    await build({ priorSessions: 1, entries: [] });
    prisma.workSession.findFirst.mockResolvedValue({ id: 'active-1', isActive: true });

    await expect(service.clockIn(principal, {} as never)).rejects.toThrow('active session');
  });

  it('leaves the day uncapped when the organization sets no shift configuration', async () => {
    await build({ priorSessions: 2, entries: loggedToday(900), maxShiftMinutes: null }); // 15h

    await expect(service.clockIn(principal, {} as never)).resolves.toBeDefined();
  });

  // Requirement (4): the returning employee must be able to say what the new
  // stretch is for, which BUG-BP's plan lock would otherwise prevent.
  it('reopens a locked plan when a second session starts', async () => {
    await build({
      priorSessions: 1,
      entries: loggedToday(300),
      scrumEntry: { id: 'entry-1', planLockedAt: new Date('2026-08-09T02:00:00.000Z'), isLocked: false },
    });

    await service.clockIn(principal, {} as never);

    expect(prisma.scrumEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ planLockedAt: null }),
      }),
    );
  });

  it('does not reopen the plan on the first session of the day', async () => {
    await build({
      priorSessions: 0,
      scrumEntry: { id: 'entry-1', planLockedAt: new Date('2026-08-09T02:00:00.000Z'), isLocked: false },
    });

    await service.clockIn(principal, {} as never);

    expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
  });

  // A fully-completed day is the supervisor's lock (BUG-AE), not the plan lock.
  it('leaves a fully-locked day locked', async () => {
    await build({
      priorSessions: 1,
      entries: loggedToday(300),
      scrumEntry: { id: 'entry-1', planLockedAt: new Date('2026-08-09T02:00:00.000Z'), isLocked: true },
    });

    await service.clockIn(principal, {} as never);

    expect(prisma.scrumEntry.update).not.toHaveBeenCalled();
  });

  it('reports the day totals the Time In button gates on', async () => {
    await build({ priorSessions: 1, entries: loggedToday(300) });

    const { dailyTotals } = await service.current(principal);

    expect(dailyTotals).toEqual(
      expect.objectContaining({
        workedMinutes: 300,
        maxDailyMinutes: 720,
        remainingMinutes: 420,
        canClockIn: true,
        blockedReason: null,
      }),
    );
  });

  // The daily cap is its own setting: an org may permit a 12-hour shift but
  // only 8 payable hours a day. Sharing one field made those inseparable.
  it('caps the day on maxDailyMinutes, not the longer shift length', async () => {
    await build({ priorSessions: 1, entries: loggedToday(480), maxShiftMinutes: 720, maxDailyMinutes: 480 });

    const { dailyTotals } = await service.current(principal);

    expect(dailyTotals.maxDailyMinutes).toBe(480);
    expect(dailyTotals.remainingMinutes).toBe(0);
    expect(dailyTotals.canClockIn).toBe(false);
    expect(dailyTotals.blockedReason).toContain('8-hour');
  });

  it('refuses a session once the daily cap is spent even with shift length left', async () => {
    await build({ priorSessions: 1, entries: loggedToday(480), maxShiftMinutes: 720, maxDailyMinutes: 480 });

    await expect(service.clockIn(principal, {} as never)).rejects.toBeInstanceOf(ConflictException);
  });

  // Unset is the pre-split behaviour, and must stay that way for any org that
  // never configures a daily cap.
  it('falls back to the shift length when no daily cap is configured', async () => {
    await build({ priorSessions: 1, entries: loggedToday(500), maxShiftMinutes: 720 });

    const { dailyTotals } = await service.current(principal);

    expect(dailyTotals.maxDailyMinutes).toBe(720);
    expect(dailyTotals.canClockIn).toBe(true);
  });

  // Never negative: an overrun day would otherwise render "-45m left".
  it('floors remaining minutes at zero when the day overran', async () => {
    await build({ priorSessions: 1, entries: loggedToday(800) }); // 13h20m of 12h

    const { dailyTotals } = await service.current(principal);

    expect(dailyTotals.remainingMinutes).toBe(0);
    expect(dailyTotals.canClockIn).toBe(false);
  });
});

/**
 * The daily ceiling used to be checked only at the moment of clock-in: a
 * session started with 30 minutes left was handed a fresh full shift and could
 * run `maxShiftMinutes` more, putting the day well past its cap. The session
 * deadline is now the earlier of the two limits.
 */
describe('WorkSessionsService — session deadline respects the day\'s remaining allowance', () => {
  let service: WorkSessionsService;
  let prisma: any;

  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: [],
  } as unknown as AuthPrincipal;

  const MAX_SHIFT = 480; // 8h cap, matching the daily ceiling

  /** Builds the service with `workedMinutes` already logged today. */
  const build = async (workedMinutes: number, maxShiftMinutes: number | null = MAX_SHIFT) => {
    prisma = {
      workSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 's-0' }]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'new-session', ...data })),
      },
      timeEntry: {
        findMany: jest.fn().mockResolvedValue(
          workedMinutes > 0
            ? [
                {
                  id: 'entry-0',
                  startTime: new Date('2026-08-09T01:00:00.000Z'),
                  endTime: new Date('2026-08-09T02:00:00.000Z'),
                  durationMinutes: workedMinutes,
                },
              ]
            : [],
        ),
        create: jest.fn(),
      },
      sessionEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      scrumEntry: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') } },
        {
          provide: ShiftLimitsService,
          useValue: {
            defaultConfig: jest.fn().mockResolvedValue(
              maxShiftMinutes === null ? null : { id: 'cfg-1', maxShiftMinutes },
            ),
            // The real implementation, so the two deadlines can actually differ.
            deadlineFor: (clockIn: Date, config: any) =>
              new Date(clockIn.getTime() + config.maxShiftMinutes * 60_000),
            evaluateAndNotify: jest.fn(),
            autoClockOut: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WorkSessionsService);
    return prisma;
  };

  /** Minutes between the created session's clock-in and its deadline. */
  const grantedMinutes = () => {
    const { clockIn, maxClockOutAt } = prisma.workSession.create.mock.calls[0][0].data;
    return Math.round((maxClockOutAt.getTime() - clockIn.getTime()) / 60_000);
  };

  it('grants only the minutes left in the day, not a whole new shift', async () => {
    await build(450); // 7h30m of 8h done — 30m left

    await service.clockIn(principal, {} as never);

    expect(grantedMinutes()).toBe(30);
  });

  it('grants the full shift when the day has more allowance than one shift', async () => {
    await build(0, 240); // fresh day, 4h shift cap under an 4h daily ceiling

    await service.clockIn(principal, {} as never);

    expect(grantedMinutes()).toBe(240);
  });

  it('leaves the deadline unset when the organization has no shift configuration', async () => {
    await build(450, null);

    await service.clockIn(principal, {} as never);

    expect(prisma.workSession.create.mock.calls[0][0].data.maxClockOutAt).toBeNull();
  });
});

/**
 * BUG-BW — GET /work-sessions/daily-log/:date. Own suite so it can wire the
 * sessionEvent mock it needs without disturbing the workDate suite below.
 */
describe('WorkSessionsService.dailyLog', () => {
  let service: WorkSessionsService;
  let workSession: { findMany: jest.Mock };
  let sessionEvent: { findMany: jest.Mock };

  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: [],
  } as unknown as AuthPrincipal;

  beforeEach(async () => {
    workSession = { findMany: jest.fn().mockResolvedValue([{ id: 'session-1' }, { id: 'session-2' }]) };
    sessionEvent = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'e1', eventType: 'CLOCK_IN', occurredAt: new Date('2026-08-09T00:02:00.000Z') },
        { id: 'e2', eventType: 'CLOCK_OUT', occurredAt: new Date('2026-08-09T09:05:00.000Z') },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkSessionsService,
        { provide: PrismaService, useValue: { workSession, sessionEvent } },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn() } },
        { provide: ShiftLimitsService, useValue: {} },
      ],
    }).compile();

    service = module.get(WorkSessionsService);
  });

  it('returns the day\'s events oldest first, scoped to the caller', async () => {
    const log = await service.dailyLog(principal, '2026-08-09');

    expect(log.date).toBe('2026-08-09');
    expect(log.events).toHaveLength(2);
    // workDate is a date-only column — UTC midnight of the requested day.
    expect(workSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          workDate: new Date('2026-08-09T00:00:00.000Z'),
        },
      }),
    );
    expect(sessionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          workSessionId: { in: ['session-1', 'session-2'] },
        },
        orderBy: { occurredAt: 'asc' },
      }),
    );
  });

  it('returns an empty log without querying events when nothing was clocked', async () => {
    workSession.findMany.mockResolvedValue([]);

    await expect(service.dailyLog(principal, '2026-08-09')).resolves.toEqual({
      date: '2026-08-09',
      events: [],
    });
    expect(sessionEvent.findMany).not.toHaveBeenCalled();
  });

  it('rejects a date that is not an ISO calendar day', async () => {
    await expect(service.dailyLog(principal, '09-08-2026')).rejects.toThrow(BadRequestException);
    expect(workSession.findMany).not.toHaveBeenCalled();
  });
});

describe('WorkSessionsService — workDate is the organization\'s local day', () => {
  let service: WorkSessionsService;
  let workSession: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  let timeEntry: { create: jest.Mock; findMany: jest.Mock };

  const principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    permissions: [],
    roles: [],
  } as unknown as AuthPrincipal;

  beforeEach(async () => {
    workSession = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      // BUG-BX: clockIn now reads the day's sessions to total cumulative hours.
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    timeEntry = { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkSessionsService,
        {
          provide: PrismaService,
          useValue: {
            workSession,
            timeEntry,
            sessionEvent: { create: jest.fn() },
            auditLog: { create: jest.fn() },
            scrumEntry: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
          },
        },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') } },
        {
          // This suite is about workDate only — no shift configuration, so clock-in
          // leaves the session unlimited and the limit logic stays out of the way.
          provide: ShiftLimitsService,
          useValue: {
            defaultConfig: jest.fn().mockResolvedValue(null),
            deadlineFor: jest.fn(),
            evaluateAndNotify: jest.fn(),
            autoClockOut: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WorkSessionsService);
  });

  afterEach(() => jest.useRealTimers());

  it('files an early-morning Manila clock-in under the local date, not the UTC one', async () => {
    // 2026-07-29T00:30+08:00 — still 2026-07-28 in UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-28T16:30:00.000Z'));

    await service.clockIn(principal, {} as never);

    const { workDate } = workSession.create.mock.calls[0][0].data;
    expect(workDate).toEqual(new Date('2026-07-29T00:00:00.000Z'));
  });

  it('keeps the same local date for a mid-afternoon clock-in', async () => {
    // 2026-07-29T14:00+08:00 — 2026-07-29 in UTC too.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T06:00:00.000Z'));

    await service.clockIn(principal, {} as never);

    const { workDate } = workSession.create.mock.calls[0][0].data;
    expect(workDate).toEqual(new Date('2026-07-29T00:00:00.000Z'));
  });
});
