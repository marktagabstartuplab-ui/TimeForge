import { Test, TestingModule } from '@nestjs/testing';
import { WorkSessionsService } from './work-sessions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

describe('WorkSessionsService — workDate is the organization\'s local day', () => {
  let service: WorkSessionsService;
  let workSession: { findFirst: jest.Mock; create: jest.Mock };
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
    };
    timeEntry = { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkSessionsService,
        {
          provide: PrismaService,
          useValue: { workSession, timeEntry, sessionEvent: { create: jest.fn() }, auditLog: { create: jest.fn() } },
        },
        { provide: OrgTimeZoneService, useValue: { forPrincipal: jest.fn().mockResolvedValue('Asia/Manila') } },
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
