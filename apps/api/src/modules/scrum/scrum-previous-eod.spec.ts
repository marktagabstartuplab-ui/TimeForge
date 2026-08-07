import { Test, TestingModule } from '@nestjs/testing';
import { ScrumService } from './scrum.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { StorageService } from '../storage/storage.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * BUG-BQ — "Yesterday's Accomplishments" is pre-filled from the previous EOD
 * review instead of being retyped. Read-only: this only produces a suggestion
 * the employee edits and saves as their own text.
 */

const principal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  roles: ['EMPLOYEE'],
  permissions: [],
} as unknown as AuthPrincipal;

/** Single-day case: one entry in the window, with its completed tasks. */
async function buildService(entry: unknown, tasks: unknown[] = []) {
  return buildServiceWith(entry ? [{ ...(entry as object), tasks }] : []);
}

/** Multi-day case: the whole window, newest first, each with its own tasks. */
async function buildServiceWith(entries: unknown[]) {
  const prisma = {
    scrumEntry: { findMany: jest.fn().mockResolvedValue(entries) },
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

  return { service: module.get(ScrumService), prisma };
}

function entryOn(date: string, today: string) {
  return { id: 'entry-prev', entryDate: new Date(`${date}T00:00:00Z`), today };
}

describe('BUG-BQ — previous EOD summary', () => {
  it('returns the EOD narrative from the previous day', async () => {
    const { service } = await buildService(
      entryOn('2026-08-05', 'Call 50 leads\n\nEOD Review — Closed 3 deals and cleared the backlog.'),
    );

    const result = await service.previousEodSummary(principal);

    expect(result.summary).toBe('Closed 3 deals and cleared the backlog.');
    expect(result.sourceDate).toBe('2026-08-05');
  });

  // The morning commitment sits before the marker and is not what was achieved.
  it('excludes the morning commitment from the summary', async () => {
    const { service } = await buildService(
      entryOn('2026-08-05', 'Plan: refactor the exporter\n\nEOD Review — Refactor done, tests green.'),
    );

    const result = await service.previousEodSummary(principal);

    expect(result.summary).toBe('Refactor done, tests green.');
    expect(result.summary).not.toContain('Plan: refactor the exporter');
  });

  // Re-submitting a review appends another marker block; the last one is current.
  it('takes the latest block when a review was re-submitted', async () => {
    const { service } = await buildService(
      entryOn('2026-08-05', 'Commitment\n\nEOD Review — First pass\n\nEOD Review — Corrected write-up'),
    );

    expect((await service.previousEodSummary(principal)).summary).toBe('Corrected write-up');
  });

  // An employee who closed their commitments but skipped the review still has
  // something true to carry forward.
  it('falls back to completed commitments and their reported actuals', async () => {
    const { service } = await buildService(entryOn('2026-08-05', 'Commitment only, no review'), [
      { title: 'Call leads', actualCompleted: '52 calls' },
      { title: 'Write the report', actualCompleted: null },
    ]);

    const result = await service.previousEodSummary(principal);

    expect(result.summary).toBe('Call leads (52 calls); Write the report');
  });

  it('returns nothing when there is no previous entry — the field stays empty', async () => {
    const { service } = await buildService(null);

    expect(await service.previousEodSummary(principal)).toEqual({
      sourceDate: null,
      summary: null,
    });
  });

  // sourceDate names where the summary came from, so with no summary there is
  // no source to name — and once the whole window is searched, singling out one
  // of several empty days would be arbitrary.
  it('returns nothing when no day in the window has a review or completed work', async () => {
    const { service } = await buildService(entryOn('2026-08-05', 'Commitment only'), []);

    expect(await service.previousEodSummary(principal)).toEqual({
      sourceDate: null,
      summary: null,
    });
  });

  // Friday → Monday: the lookback window is a week, not one day, so a weekend or
  // a day off does not silently produce an empty field.
  it('reaches back past the weekend for the most recent review', async () => {
    const { service, prisma } = await buildService(
      entryOn('2026-08-07', 'x\n\nEOD Review — Friday wrap-up'),
    );

    const result = await service.previousEodSummary(principal);

    expect(result.summary).toBe('Friday wrap-up');
    // Newest-first, strictly before today, bounded by the lookback window.
    const [args] = prisma.scrumEntry.findMany.mock.calls[0];
    expect(args.orderBy).toEqual({ entryDate: 'desc' });
    expect(args.where.entryDate.lt).toBeInstanceOf(Date);
    expect(args.where.entryDate.gte).toBeInstanceOf(Date);
    const spanDays =
      (args.where.entryDate.lt.getTime() - args.where.entryDate.gte.getTime()) / 86_400_000;
    expect(spanDays).toBe(7);
  });

  // The bug this originally shipped with: planning a day creates an entry
  // whether or not the review is ever filed, so the newest entry was often an
  // empty one. Taking only that entry let it shadow every earlier day that did
  // have a review, and the field stayed blank despite the week-long lookback.
  it('skips a planned-but-unreviewed day and uses the last real review', async () => {
    const { service } = await buildServiceWith([
      { ...entryOn('2026-08-06', ''), tasks: [] },
      { ...entryOn('2026-08-05', 'Plan\n\nEOD Review — Shipped the exporter'), tasks: [] },
    ]);

    const result = await service.previousEodSummary(principal);

    expect(result.summary).toBe('Shipped the exporter');
    expect(result.sourceDate).toBe('2026-08-05');
  });

  // Each day is judged whole before falling further back, so yesterday's closed
  // commitments beat an older write-up — they're the more recent real work.
  it('prefers a recent day\'s completed work over an older narrative', async () => {
    const { service } = await buildServiceWith([
      {
        ...entryOn('2026-08-06', 'Commitment only'),
        tasks: [{ title: 'Ship the invoice fix', actualCompleted: null }],
      },
      { ...entryOn('2026-08-05', 'Plan\n\nEOD Review — Older write-up'), tasks: [] },
    ]);

    const result = await service.previousEodSummary(principal);

    expect(result.summary).toBe('Ship the invoice fix');
    expect(result.sourceDate).toBe('2026-08-06');
  });

  it('scopes the lookup to the caller', async () => {
    const { service, prisma } = await buildService(null);

    await service.previousEodSummary(principal);

    const [args] = prisma.scrumEntry.findMany.mock.calls[0];
    expect(args.where).toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      deletedAt: null,
    });
  });
});
