import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  ScrumEntry,
  ScrumTask,
  ScrumBlocker,
  ScrumEditRequest,
  BlockerSeverity,
  BlockerStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { PERMISSIONS, orgDateOnly, orgWeekDays, startOfOrgDay } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService, withAvatarUrl } from '../storage/storage.service';
import {
  CommentScrumEntryDto,
  CreateScrumBlockerDto,
  CreateScrumEntryDto,
  CreateScrumEditRequestDto,
  CreateScrumTaskDto,
  DeclineScrumEditRequestDto,
  ScrumQuery,
  UnlockScrumEntryDto,
  UpdateScrumBlockerDto,
  UpdateScrumEntryDto,
  UpdateScrumTaskDto,
} from './dto';

export interface ScrumMgmtQuery {
  from?: string;
  to?: string;
}

export interface ScrumBlockersQuery {
  severity?: string;
  status?: string;
  limit?: string;
  cursor?: string;
}

type ScrumMgmtScope = { scope: 'org' | 'team'; userIds?: string[] };

/**
 * Fields the End of Day review writes. The entry lock freezes the *plan* (title,
 * target, scope) once the day reaches 100% — it must not block recording what
 * actually happened, or a fully-completed day could never file its EOD review.
 */
const EOD_REPORT_FIELDS: ReadonlySet<string> = new Set([
  'actualCompleted',
  'continueTomorrow',
  'notCompletedReason',
  'taskStatus',
  'version',
]);

/** True when the payload only reports results and touches nothing in the plan. */
function isEodReportOnly(dto: UpdateScrumTaskDto): boolean {
  const values = dto as unknown as Record<string, unknown>;
  const touched = Object.keys(dto).filter((key) => values[key] !== undefined);
  return touched.length > 0 && touched.every((key) => EOD_REPORT_FIELDS.has(key));
}

/**
 * Same idea as EOD_REPORT_FIELDS, one level up: the fields the End of Day review
 * writes on the *entry* itself (it appends its "EOD Review — …" line to `today`
 * and records the day's final blockers). Everything else on a locked entry —
 * yesterday, notes, progress, status — is plan/self-report data that must not
 * change after submission.
 */
const EOD_ENTRY_FIELDS: ReadonlySet<string> = new Set(['today', 'blockers', 'version']);

function isEodEntryReportOnly(dto: UpdateScrumEntryDto): boolean {
  const values = dto as unknown as Record<string, unknown>;
  const touched = Object.keys(dto).filter((key) => values[key] !== undefined);
  return touched.length > 0 && touched.every((key) => EOD_ENTRY_FIELDS.has(key));
}

/** How far back carry-over looks for a day with uncompleted "continue tomorrow" tasks. */
const CARRY_OVER_LOOKBACK_DAYS = 7;

/**
 * BUG-BQ. The EOD review appends its accomplishments to `ScrumEntry.today`
 * behind this marker (see EodReviewModal) — everything before it is the
 * morning's commitment, everything after is what actually got done.
 */
const EOD_MARKER = 'EOD Review — ';

/**
 * How far back "Yesterday's Accomplishments" looks. Deliberately not one day:
 * Monday's scrum should offer Friday's review, and a day off in between must not
 * silently produce an empty field.
 */
const PREVIOUS_EOD_LOOKBACK_DAYS = 7;

/** Refusal message shared by every locked-record guard. */
const LOCKED_MESSAGE =
  "Today's scrum plan is locked. Ask your supervisor to unlock the day to change it.";

/**
 * BUG-BP: refusal for a plan that was saved but whose day hasn't closed yet.
 * Separate message from LOCKED_MESSAGE so the employee can tell "I submitted my
 * plan" apart from "the day is finished".
 */
const PLAN_LOCKED_MESSAGE =
  'Your daily plan is locked because you saved it. Ask your supervisor to approve an edit to change it.';

/**
 * The blocker fields the day's normal flow writes after the plan is locked —
 * resolving or reopening a blocker is progress reporting, not re-planning, so it
 * passes the plan lock the same way EOD task results do.
 */
const BLOCKER_STATUS_FIELDS: ReadonlySet<string> = new Set(['status', 'version']);

function isBlockerStatusOnly(dto: UpdateScrumBlockerDto): boolean {
  const values = dto as unknown as Record<string, unknown>;
  const touched = Object.keys(dto).filter((key) => values[key] !== undefined);
  return touched.length > 0 && touched.every((key) => BLOCKER_STATUS_FIELDS.has(key));
}

@Injectable()
export class ScrumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly deptScope: DepartmentScopeService,
    private readonly storage: StorageService,
    private readonly timeZones: OrgTimeZoneService,
  ) {}

  // ── Reads ───────────────────────────────────────────────────────────────────

  async findAll(p: AuthPrincipal, query: ScrumQuery): Promise<PageResult<ScrumEntry>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.ScrumEntryWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(await this.resolveUserFilter(p, query.userId)),
      ...(query.hasBlockers === 'true' ? { blockers: { not: null } } : {}),
      ...(query.from || query.to
        ? {
            entryDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.scrumEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return buildPage(items, limit);
  }

  async findOne(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    await this.assertCanView(p, entry.userId);
    return entry;
  }

  /**
   * Tasks the employee said they would continue ("Will you continue this
   * tomorrow?" = Yes in a previous End of Day review) and that are still not
   * completed. Feeds the "Continued Tasks" section of Quick Select so the plan
   * carries across days instead of being retyped.
   *
   * Sourced from the most recent prior day that has any such task (not strictly
   * yesterday — weekends and leave would otherwise drop the carry-over), within
   * a short lookback so a long-abandoned task doesn't resurface forever. Tasks
   * already re-planned today (same title) are filtered out, so the section
   * empties itself as they're added.
   */
  /**
   * BUG-BQ: summarises the caller's most recent previous EOD review so the
   * Daily Plan can pre-fill "Yesterday's Accomplishments" instead of asking
   * them to retype what they already reported.
   *
   * Read-only and lossless by design — it returns a suggestion the employee
   * edits and saves as their own text. Nothing is written here, and the EOD
   * record itself is never touched.
   *
   * Prefers the EOD narrative, falling back to the completed commitments and
   * their reported actuals: an employee who closed their tasks but skipped the
   * review still has something true to carry forward.
   */
  async previousEodSummary(
    p: AuthPrincipal,
  ): Promise<{ sourceDate: string | null; summary: string | null }> {
    const today = await this.todayDate(p);
    const lookbackFrom = new Date(today.getTime() - PREVIOUS_EOD_LOOKBACK_DAYS * 86_400_000);

    const previous = await this.prisma.scrumEntry.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        deletedAt: null,
        entryDate: { gte: lookbackFrom, lt: today },
      },
      orderBy: { entryDate: 'desc' },
      select: { id: true, entryDate: true, today: true },
    });
    if (!previous) return { sourceDate: null, summary: null };

    const sourceDate = previous.entryDate.toISOString().slice(0, 10);

    // The narrative the employee wrote in their review. `today` can hold several
    // marker blocks if a review was re-submitted, so take the last one.
    const blocks = (previous.today ?? '').split(EOD_MARKER);
    const narrative = blocks.length > 1 ? blocks[blocks.length - 1].trim() : '';
    if (narrative) return { sourceDate, summary: narrative.slice(0, 2000) };

    const completed = await this.prisma.scrumTask.findMany({
      where: { scrumEntryId: previous.id, deletedAt: null, taskStatus: 'COMPLETED' },
      select: { title: true, actualCompleted: true },
      orderBy: { createdAt: 'asc' },
    });
    if (completed.length === 0) return { sourceDate, summary: null };

    const summary = completed
      .map((t) => (t.actualCompleted ? `${t.title} (${t.actualCompleted})` : t.title))
      .join('; ');
    return { sourceDate, summary: summary.slice(0, 2000) };
  }

  async carryOverTasks(
    p: AuthPrincipal,
  ): Promise<{ sourceEntryId: string | null; sourceDate: string | null; tasks: ScrumTask[] }> {
    const today = await this.todayDate(p);
    const lookbackFrom = new Date(today.getTime() - CARRY_OVER_LOOKBACK_DAYS * 86_400_000);

    const candidates = await this.prisma.scrumTask.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: p.userId,
        deletedAt: null,
        continueTomorrow: true,
        taskStatus: { not: 'COMPLETED' },
        scrumEntry: {
          deletedAt: null,
          userId: p.userId,
          entryDate: { gte: lookbackFrom, lt: today },
        },
      },
      include: { scrumEntry: { select: { id: true, entryDate: true } } },
      orderBy: [{ scrumEntry: { entryDate: 'desc' } }, { createdAt: 'asc' }],
    });
    if (candidates.length === 0) return { sourceEntryId: null, sourceDate: null, tasks: [] };

    // Keep only the latest source day — mixing several days' leftovers would
    // present the same task twice under different dates.
    const source = candidates[0].scrumEntry;
    const fromLatestDay = candidates.filter((t) => t.scrumEntryId === source.id);

    const todayEntry = await this.prisma.scrumEntry.findFirst({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        entryDate: today,
        deletedAt: null,
      },
      select: { id: true },
    });
    const alreadyPlanned = todayEntry
      ? new Set(
          (
            await this.prisma.scrumTask.findMany({
              where: { scrumEntryId: todayEntry.id, deletedAt: null },
              select: { title: true },
            })
          ).map((t) => t.title.trim().toLowerCase()),
        )
      : new Set<string>();

    const tasks = fromLatestDay
      .filter((t) => !alreadyPlanned.has(t.title.trim().toLowerCase()))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ scrumEntry: _entry, ...task }) => task);

    if (tasks.length === 0) return { sourceEntryId: null, sourceDate: null, tasks: [] };
    return {
      sourceEntryId: source.id,
      sourceDate: source.entryDate.toISOString().slice(0, 10),
      tasks,
    };
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateScrumEntryDto): Promise<ScrumEntry> {
    const entryDate = new Date(dto.entryDate);
    if (isNaN(entryDate.getTime())) {
      throw new UnprocessableEntityException('entryDate must be a valid date');
    }

    // entryDate must not be in the future. Clients send their local calendar
    // date, so "today" is the organization's local day — comparing against the
    // server's UTC date rejected every scrum save between local midnight and
    // local 08:00, blocking the whole Daily Scrum/EOD workflow in that window.
    // (This previously carried a blanket one-day grace to work around that; the
    // local day is exact, so tomorrow is correctly refused again.)
    const latestAllowed = await this.todayDate(p);
    if (entryDate > latestAllowed) {
      throw new UnprocessableEntityException('entryDate cannot be in the future');
    }

    // One entry per user per day
    const existing = await this.prisma.scrumEntry.findFirst({
      where: {
        tenantId: p.tenantId,
        userId: p.userId,
        entryDate,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('A scrum entry already exists for this date');
    }

    return this.prisma.scrumEntry.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        entryDate,
        yesterday: dto.yesterday,
        today: dto.today,
        blockers: dto.blockers ?? null,
        notes: dto.notes ?? null,
        progress: dto.progress ?? 0,
        status: dto.status ?? 'NOT_STARTED',
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  /**
   * Owner can edit their own entry on the same day only.
   */
  async update(p: AuthPrincipal, id: string, dto: UpdateScrumEntryDto): Promise<ScrumEntry> {
    const entry = await this.ownEntry(p, id);
    // A submitted (locked) day is a read-only record. Checked before the version
    // token so a locked entry is refused outright rather than inviting a retry
    // with a fresher version. The EOD review's own fields still pass through.
    if (entry.isLocked && !isEodEntryReportOnly(dto)) {
      throw new ForbiddenException(LOCKED_MESSAGE);
    }
    // BUG-BP: a saved plan is read-only for its own fields too — re-editing
    // yesterday/notes after submission needs the supervisor's approval.
    if (!isEodEntryReportOnly(dto)) await this.assertPlanEditable(id);
    if (entry.version !== dto.version) throw new ConflictException('Version mismatch');

    // BUG-BP: saving the plan is the submission — from here the commitments,
    // blockers and the yesterday/notes text are read-only. EOD writes (today /
    // blockers only) must not trip it, and re-saving never moves the timestamp.
    const planLockedAt =
      entry.planLockedAt ?? (isEodEntryReportOnly(dto) ? null : new Date());

    return this.prisma.scrumEntry.update({
      where: { id },
      data: {
        planLockedAt,
        yesterday: dto.yesterday ?? entry.yesterday,
        today: dto.today ?? entry.today,
        blockers: dto.blockers !== undefined ? (dto.blockers ?? null) : entry.blockers,
        notes: dto.notes !== undefined ? (dto.notes ?? null) : entry.notes,
        progress: dto.progress ?? entry.progress,
        status: dto.status ?? entry.status,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Supervisor adds a comment to an entry on their team (stored in supervisorNote).
   */
  async comment(p: AuthPrincipal, id: string, dto: CommentScrumEntryDto): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');

    // Must be the supervisor or admin
    if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      throw new ForbiddenException('Only supervisors can comment on team scrum entries');
    }

    // Supervisor scope: entry owner must be in their team
    if (!(await this.isInTeam(p, entry.userId))) {
      throw new ForbiddenException('This entry is outside your team');
    }

    if (entry.version !== dto.version) throw new ConflictException('Version mismatch');

    const updated = await this.prisma.scrumEntry.update({
      where: { id },
      data: {
        supervisorNote: dto.comment,
        // A new comment is new information — clear any earlier dismissal so it
        // surfaces on the employee's dashboard again (BUG-AR).
        supervisorNoteDismissedAt: null,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'ADMIN_ACTION',
        entityType: 'ScrumEntry',
        entityId: id,
        metadata: { event: 'SCRUM_COMMENT_POSTED', comment: dto.comment },
      },
    });

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: entry.userId,
      senderId: p.userId,
      type: 'ANNOUNCEMENT',
      category: 'DAILY_SCRUM',
      title: 'Supervisor commented on your scrum entry',
      // Include the actual feedback so the employee can read it directly — the
      // note isn't surfaced elsewhere on the employee's scrum view.
      message: `Your supervisor left feedback: "${dto.comment.trim().slice(0, 500)}"`,
      actionUrl: `/time-tracking?scrum=${id}`,
      actionLabel: 'View Scrum',
    });

    return updated;
  }

  /**
   * Employee dismisses the supervisor comment on their own entry: it stops
   * rendering on the active dashboard, but the text is deliberately kept so the
   * entry's history record stays complete (BUG-AR). Idempotent — re-dismissing
   * an already-dismissed note is a no-op rather than an error, since the button
   * can be clicked twice before the refetch lands.
   */
  async dismissComment(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.ownEntry(p, id);
    if (!entry.supervisorNote) {
      throw new NotFoundException('This entry has no supervisor comment');
    }
    if (entry.supervisorNoteDismissedAt) return entry;

    const updated = await this.prisma.scrumEntry.update({
      where: { id },
      data: {
        supervisorNoteDismissedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'ADMIN_ACTION',
        entityType: 'ScrumEntry',
        entityId: id,
        metadata: { event: 'SCRUM_COMMENT_DISMISSED' },
      },
    });

    return updated;
  }

  /**
   * Supervisor removes their comment outright — unlike a dismissal this erases
   * the text everywhere, including history, so it is restricted to callers who
   * could have written it in the first place (same team-scope check as `comment`).
   * The original text is preserved in the audit log.
   */
  async deleteComment(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      throw new ForbiddenException('Only supervisors can delete scrum comments');
    }
    if (!(await this.isInTeam(p, entry.userId))) {
      throw new ForbiddenException('This entry is outside your team');
    }
    if (!entry.supervisorNote) {
      throw new NotFoundException('This entry has no supervisor comment');
    }

    const updated = await this.prisma.scrumEntry.update({
      where: { id },
      data: {
        supervisorNote: null,
        supervisorNoteDismissedAt: null,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'ADMIN_ACTION',
        entityType: 'ScrumEntry',
        entityId: id,
        metadata: { event: 'SCRUM_COMMENT_DELETED', comment: entry.supervisorNote },
      },
    });

    return updated;
  }

  // ── Edit requests (locked-entry reopen workflow) ────────────────────────────

  /**
   * Employee asks their supervisor to reopen their own locked scrum. Creates a
   * PENDING request and notifies the supervisor; granting it is the existing
   * unlock endpoint. One open request per entry — re-asking updates the reason
   * rather than stacking duplicates in the supervisor's queue.
   */
  async requestEdit(
    p: AuthPrincipal,
    entryId: string,
    dto: CreateScrumEditRequestDto,
  ): Promise<ScrumEditRequest> {
    const entry = await this.ownEntry(p, entryId);

    // Deliberately allowed on an unlocked day too (BUG-AP follow-up). The day only locks
    // automatically once every commitment is COMPLETED, so between planning and
    // completion an employee has no way to correct a mistyped commitment —
    // asking the supervisor is that path, same as the locked case.

    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 5) {
      throw new UnprocessableEntityException('A reason of at least 5 characters is required');
    }

    const existing = await this.prisma.scrumEditRequest.findFirst({
      where: { scrumEntryId: entry.id, status: 'PENDING', deletedAt: null },
    });

    const request = existing
      ? await this.prisma.scrumEditRequest.update({
          where: { id: existing.id },
          data: { reason, updatedBy: p.userId, version: { increment: 1 } },
        })
      : await this.prisma.scrumEditRequest.create({
          data: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            scrumEntryId: entry.id,
            requesterId: p.userId,
            reason,
            createdBy: p.userId,
            updatedBy: p.userId,
          },
        });

    await this.notifySupervisorOf(p.userId, p.tenantId, p.organizationId, {
      type: 'SCRUM_ENTRY_LOCKED',
      title: 'Daily Scrum edit requested',
      message: `An employee asked to ${entry.isLocked ? 'reopen their locked scrum' : 'edit their commitments'} for ${entry.entryDate.toISOString().slice(0, 10)}. Reason: ${reason}`,
      actionUrl: '/team-scrum',
      actionLabel: 'Review request',
    });

    return request;
  }

  /** The caller's own open request for an entry, if any — drives the employee's button state. */
  async myEditRequest(p: AuthPrincipal, entryId: string): Promise<ScrumEditRequest | null> {
    await this.ownEntry(p, entryId);
    return this.prisma.scrumEditRequest.findFirst({
      where: { scrumEntryId: entryId, requesterId: p.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Pending reopen requests the caller is allowed to act on — the supervisor's
   * dashboard queue. Scoped exactly like the unlock they lead to: admins see the
   * organization, supervisors only their own department's members.
   */
  async listEditRequests(p: AuthPrincipal) {
    const scope = await this.resolveScrumMgmtScope(p);
    const requests = await this.prisma.scrumEditRequest.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'PENDING',
        deletedAt: null,
        ...(scope.scope === 'team' ? { requesterId: { in: scope.userIds ?? [] } } : {}),
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
        scrumEntry: { select: { id: true, entryDate: true, isLocked: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const avatarUrls = await this.storage.signedUrlsByKey(requests.map((r) => r.requester.avatarKey));
    return requests.map((r) => ({ ...r, requester: withAvatarUrl(r.requester, avatarUrls) }));
  }

  /**
   * Supervisor declines a reopen request. The entry stays locked; the employee
   * is told why so the request doesn't just vanish from their screen.
   */
  async declineEditRequest(
    p: AuthPrincipal,
    requestId: string,
    dto: DeclineScrumEditRequestDto,
  ): Promise<ScrumEditRequest> {
    const request = await this.prisma.scrumEditRequest.findFirst({
      where: { id: requestId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Edit request not found');
    if (request.status !== 'PENDING') {
      throw new ConflictException('This request has already been resolved');
    }
    await this.assertCanUnlock(p, request.requesterId);

    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 5) {
      throw new UnprocessableEntityException('A reason of at least 5 characters is required');
    }

    const updated = await this.prisma.scrumEditRequest.update({
      where: { id: request.id },
      data: {
        status: 'DECLINED',
        resolvedById: p.userId,
        resolvedAt: new Date(),
        resolutionNote: reason,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: request.requesterId,
      senderId: p.userId,
      type: 'ANNOUNCEMENT',
      category: 'DAILY_SCRUM',
      title: 'Daily Scrum edit request declined',
      message: `Your supervisor declined to reopen your scrum. Reason: ${reason}`,
      actionUrl: `/time-tracking?scrum=${request.scrumEntryId}`,
      actionLabel: 'View Scrum',
    });

    return updated;
  }

  /**
   * Supervisor unlocks a team member's locked Today's Commitment so the
   * employee/intern can edit their scrum tasks again. Department-scoped: only the
   * head of the entry owner's department (or an admin) may unlock. Audited, and
   * the employee is notified. Optionally records the supervisor's unlock reason.
   */
  async unlockEntry(p: AuthPrincipal, id: string, dto: UnlockScrumEntryDto): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');

    await this.assertCanUnlock(p, entry.userId);

    // An unlocked entry can still carry an open edit request (BUG-AP follow-up) — that is
    // the employee asking for permission to change commitments on a day that
    // never auto-locked. Approving it is this same action, minus the unlock.
    const pending = await this.prisma.scrumEditRequest.findFirst({
      where: { scrumEntryId: id, status: 'PENDING', deletedAt: null },
    });
    if (!entry.isLocked && !pending) {
      throw new ConflictException('This scrum entry is not locked');
    }

    // Reason is mandatory (also enforced by the DTO) — guard here too so a
    // whitespace-only value can't slip past into the audit trail.
    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 5) {
      throw new UnprocessableEntityException('An unlock reason of at least 5 characters is required');
    }

    // Owner's department — recorded in the unlock event history for traceability.
    const owner = await this.prisma.user.findFirst({
      where: { id: entry.userId },
      select: { departmentId: true },
    });

    // Reopen the day's completed commitments too. Without this the unlock is
    // cosmetic: each task stays COMPLETED (so still immutable), and the first
    // recalcEntryProgress would immediately re-lock the entry at 100%. The
    // reported actuals (actualCompleted etc.) are deliberately preserved.
    let updated = entry;
    if (entry.isLocked) {
      await this.prisma.scrumTask.updateMany({
        where: { scrumEntryId: id, taskStatus: 'COMPLETED', deletedAt: null },
        data: { taskStatus: 'IN_PROGRESS', completedAt: null, updatedBy: p.userId },
      });

      updated = await this.prisma.scrumEntry.update({
        where: { id },
        data: {
          isLocked: false,
          // BUG-BP: a reopened day is fully editable again, plan included —
          // otherwise the unlock would leave the commitments frozen.
          planLockedAt: null,
          status: 'IN_PROGRESS',
          progress: 0,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'ADMIN_ACTION',
        entityType: 'ScrumEntry',
        entityId: id,
        metadata: {
          event: entry.isLocked ? 'SCRUM_ENTRY_UNLOCKED' : 'SCRUM_EDIT_APPROVED',
          reason,
          employeeId: entry.userId,
          departmentId: owner?.departmentId ?? null,
          entryDate: entry.entryDate.toISOString(),
        },
      },
    });

    // An unlock IS the approval of any open reopen request for this entry, so
    // close it out — otherwise it would sit in the supervisor's queue forever,
    // asking for something already granted.
    await this.prisma.scrumEditRequest.updateMany({
      where: { scrumEntryId: id, status: 'PENDING', deletedAt: null },
      data: {
        status: 'APPROVED',
        resolvedById: p.userId,
        resolvedAt: new Date(),
        resolutionNote: reason,
        updatedBy: p.userId,
      },
    });

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: entry.userId,
      senderId: p.userId,
      type: 'ANNOUNCEMENT',
      category: 'DAILY_SCRUM',
      title: entry.isLocked ? "Today's Commitment unlocked" : 'Edit request approved',
      message: entry.isLocked
        ? `Your supervisor unlocked today's commitment so you can edit it again. Reason: ${reason}`
        : `Your supervisor approved your request to edit today's commitments. Reason: ${reason}`,
      actionUrl: `/time-tracking?scrum=${id}`,
      actionLabel: 'Edit Scrum',
    });

    return updated;
  }

  /**
   * Employee closes a revision: the entry they were granted access to is locked
   * again immediately (BUG-AQ). Without this the reopen workflow had no exit —
   * an unlocked past day stayed editable indefinitely, because the automatic
   * re-lock only fires when a day reaches 100% task completion, which a past
   * entry reopened for a typo fix will never newly cross.
   *
   * Deliberately not an approval step: the supervisor already approved the edit
   * by unlocking, so the employee owns the resubmission. They are notified that
   * it landed, and the audit log records who resubmitted and when.
   */
  async resubmitEntry(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.ownEntry(p, id);
    if (entry.isLocked) {
      throw new ConflictException('This scrum entry is already locked');
    }

    // Progress/status stay derived from the task rows — resubmitting records
    // that the employee is done editing, it must not claim work was completed.
    const tasks = await this.prisma.scrumTask.findMany({
      where: { scrumEntryId: id, deletedAt: null },
      select: { taskStatus: true },
    });
    const completed = tasks.filter((t) => t.taskStatus === 'COMPLETED').length;
    const progress = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : entry.progress;

    const updated = await this.prisma.scrumEntry.update({
      where: { id },
      data: {
        isLocked: true,
        progress,
        status: progress === 100 ? 'COMPLETED' : entry.status,
        submittedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'ADMIN_ACTION',
        entityType: 'ScrumEntry',
        entityId: id,
        metadata: {
          event: 'SCRUM_ENTRY_RESUBMITTED',
          entryDate: entry.entryDate.toISOString(),
          progress,
        },
      },
    });

    await this.notifySupervisorOf(p.userId, p.tenantId, p.organizationId, {
      type: 'SCRUM_ENTRY_LOCKED',
      title: 'Daily Scrum resubmitted',
      message: `An employee finished revising their scrum for ${entry.entryDate.toISOString().slice(0, 10)} and it is locked again.`,
      actionUrl: '/team-scrum',
      actionLabel: 'View scrum',
    });

    return updated;
  }

  // ── Scrum Tasks ─────────────────────────────────────────────────────────────

  async listTasks(p: AuthPrincipal, entryId: string): Promise<ScrumTask[]> {
    const entry = await this.entryForView(p, entryId);
    return this.prisma.scrumTask.findMany({
      where: { scrumEntryId: entry.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTask(p: AuthPrincipal, entryId: string, dto: CreateScrumTaskDto): Promise<ScrumTask> {
    const entry = await this.ownEntry(p, entryId);
    if (entry.isLocked) throw new ForbiddenException(LOCKED_MESSAGE);
    await this.assertPlanEditable(entry.id); // BUG-BP
    await this.validateProjectRef(p, dto.projectId);
    const kpiFields = await this.resolveKpiTemplateFields(p, dto.kpiTemplateId);

    const task = await this.prisma.scrumTask.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumEntryId: entry.id,
        employeeId: p.userId,
        title: dto.title,
        description: dto.description ?? null,
        // BUG-BH: both columns are non-nullable, and an ad-hoc task has no
        // planned expectation to record — empty string, not filler text.
        expectedOutput: dto.expectedOutput ?? '',
        measurement: dto.measurement ?? '',
        projectId: dto.projectId ?? null,
        taskStatus: dto.taskStatus ?? 'PENDING',
        // Mirrors updateTask: a task that arrives already COMPLETED gets its
        // completion timestamp now, so EOD-added finished work isn't left with a
        // COMPLETED status and a null completedAt.
        completedAt: dto.taskStatus === 'COMPLETED' ? new Date() : null,
        priority: dto.priority ?? 'MEDIUM',
        kpiTemplateId: dto.kpiTemplateId ?? null,
        kpi: kpiFields?.kpi ?? dto.kpi ?? null,
        plannedTarget: dto.plannedTarget ?? kpiFields?.suggestedTarget ?? null,
        actualCompleted: dto.actualCompleted ?? null,
        estimatedHours: dto.estimatedHours ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.recalcEntryProgress(entry.id, p.userId);
    return task;
  }

  async updateTask(p: AuthPrincipal, id: string, dto: UpdateScrumTaskDto): Promise<ScrumTask> {
    const task = await this.ownTask(p, id);
    if (task.version !== dto.version) throw new ConflictException('Version mismatch');
    // Result-only updates (the EOD review) are allowed through the lock; anything
    // that edits the plan itself is not.
    if (!isEodReportOnly(dto)) {
      this.assertTaskNotCompleted(task);
      await this.assertEntryUnlocked(task.scrumEntryId);
      await this.assertPlanEditable(task.scrumEntryId); // BUG-BP
    }
    await this.validateProjectRef(p, dto.projectId);
    const kpiFields = dto.kpiTemplateId !== undefined ? await this.resolveKpiTemplateFields(p, dto.kpiTemplateId) : null;

    const wasCompleted = task.taskStatus === 'COMPLETED';
    const willComplete = dto.taskStatus === 'COMPLETED';

    const updated = await this.prisma.scrumTask.update({
      where: { id },
      data: {
        title: dto.title ?? task.title,
        description: dto.description !== undefined ? (dto.description ?? null) : task.description,
        expectedOutput: dto.expectedOutput ?? task.expectedOutput,
        measurement: dto.measurement ?? task.measurement,
        projectId: dto.projectId !== undefined ? (dto.projectId ?? null) : task.projectId,
        taskStatus: dto.taskStatus ?? task.taskStatus,
        completedAt: !wasCompleted && willComplete ? new Date() : wasCompleted && dto.taskStatus && !willComplete ? null : task.completedAt,
        priority: dto.priority ?? task.priority,
        kpiTemplateId: dto.kpiTemplateId !== undefined ? (dto.kpiTemplateId ?? null) : task.kpiTemplateId,
        kpi: kpiFields ? kpiFields.kpi : dto.kpi !== undefined ? (dto.kpi ?? null) : task.kpi,
        plannedTarget: kpiFields ? (dto.plannedTarget ?? kpiFields.suggestedTarget) : dto.plannedTarget !== undefined ? (dto.plannedTarget ?? null) : task.plannedTarget,
        actualCompleted: dto.actualCompleted !== undefined ? (dto.actualCompleted ?? null) : task.actualCompleted,
        continueTomorrow: dto.continueTomorrow !== undefined ? (dto.continueTomorrow ?? null) : task.continueTomorrow,
        notCompletedReason:
          dto.notCompletedReason !== undefined ? (dto.notCompletedReason || null) : task.notCompletedReason,
        estimatedHours: dto.estimatedHours ?? task.estimatedHours,
        actualHours: dto.actualHours ?? task.actualHours,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.recalcEntryProgress(task.scrumEntryId, p.userId);
    return updated;
  }

  async completeTask(p: AuthPrincipal, id: string, version: number): Promise<ScrumTask> {
    const task = await this.ownTask(p, id);
    // Idempotency first: completing an already-COMPLETED task is a no-op, so it
    // must not depend on holding a current version token. Behind the version
    // check this branch was unreachable in the one case it exists for — a client
    // re-clicking a task whose version had already moved on — which turned a
    // harmless repeat click into a permanent 409.
    if (task.taskStatus === 'COMPLETED') return task;
    if (task.version !== version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(task.scrumEntryId);

    const updated = await this.prisma.scrumTask.update({
      where: { id },
      data: {
        taskStatus: 'COMPLETED',
        completedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.recalcEntryProgress(task.scrumEntryId, p.userId);
    return updated;
  }

  async deleteTask(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const task = await this.ownTask(p, id);
    if (task.version !== version) throw new ConflictException('Version mismatch');
    this.assertTaskNotCompleted(task);
    await this.assertEntryUnlocked(task.scrumEntryId);
    await this.assertPlanEditable(task.scrumEntryId); // BUG-BP
    await this.prisma.scrumTask.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId, version: { increment: 1 } },
    });
    await this.recalcEntryProgress(task.scrumEntryId, p.userId);
  }

  // ── Scrum Blockers ──────────────────────────────────────────────────────────

  async listBlockers(p: AuthPrincipal, entryId: string): Promise<ScrumBlocker[]> {
    const entry = await this.entryForView(p, entryId);
    return this.prisma.scrumBlocker.findMany({
      where: { scrumEntryId: entry.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBlocker(p: AuthPrincipal, entryId: string, dto: CreateScrumBlockerDto): Promise<ScrumBlocker> {
    const entry = await this.ownEntry(p, entryId);
    if (entry.isLocked) throw new ForbiddenException(LOCKED_MESSAGE);
    await this.assertPlanEditable(entry.id); // BUG-BP

    const blocker = await this.prisma.scrumBlocker.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumEntryId: entry.id,
        title: dto.title,
        description: dto.description ?? null,
        severity: dto.severity ?? 'MEDIUM',
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });

    await this.notifySupervisorOf(p.userId, p.tenantId, p.organizationId, {
      type: 'SCRUM_BLOCKER_ADDED',
      title: 'New blocker reported',
      message: `A blocker was added: "${dto.title}"`,
    });

    return blocker;
  }

  async updateBlocker(p: AuthPrincipal, id: string, dto: UpdateScrumBlockerDto): Promise<ScrumBlocker> {
    const blocker = await this.ownBlocker(p, id);
    if (blocker.version !== dto.version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(blocker.scrumEntryId);
    // BUG-BP: resolving/reopening stays open after the plan locks; rewording or
    // re-grading a blocker is re-planning and does not.
    if (!isBlockerStatusOnly(dto)) await this.assertPlanEditable(blocker.scrumEntryId);

    return this.prisma.scrumBlocker.update({
      where: { id },
      data: {
        title: dto.title ?? blocker.title,
        description: dto.description !== undefined ? (dto.description ?? null) : blocker.description,
        severity: dto.severity ?? blocker.severity,
        status: dto.status ?? blocker.status,
        resolvedAt: dto.status === 'RESOLVED' && blocker.status !== 'RESOLVED' ? new Date() : dto.status === 'OPEN' ? null : blocker.resolvedAt,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  async resolveBlocker(p: AuthPrincipal, id: string, version: number): Promise<ScrumBlocker> {
    const blocker = await this.ownBlocker(p, id);
    if (blocker.version !== version) throw new ConflictException('Version mismatch');
    if (blocker.status === 'RESOLVED') return blocker;
    await this.assertEntryUnlocked(blocker.scrumEntryId);

    return this.prisma.scrumBlocker.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  async deleteBlocker(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const blocker = await this.ownBlocker(p, id);
    if (blocker.version !== version) throw new ConflictException('Version mismatch');
    await this.assertEntryUnlocked(blocker.scrumEntryId);
    await this.assertPlanEditable(blocker.scrumEntryId); // BUG-BP
    await this.prisma.scrumBlocker.delete({ where: { id } });
  }

  // ── Daily Scrum Management dashboard (Supervisor: team scope, Admin: org scope) ──

  /** KPI cards + Recent Submissions + Team Status. */
  async dashboard(p: AuthPrincipal, query: ScrumMgmtQuery) {
    const scope = await this.resolveScrumMgmtScope(p);
    const timeZone = await this.timeZones.forPrincipal(p);
    // entryDate bounds are date-only day values; resolvedAt is a real instant.
    const today = orgDateOnly(new Date(), timeZone);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
    const sevenDaysAgoInstant = startOfOrgDay(new Date(), timeZone, -6);

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(scope.userIds ? { id: { in: scope.userIds } } : {}),
      },
      select: { id: true, teamId: true },
    });
    const userIds = users.map((u) => u.id);
    const teamIds = Array.from(new Set(users.map((u) => u.teamId).filter((id): id is string => !!id)));

    const [todayEntries, sevenDayEntries, openBlockers, resolvedBlockers, lateSubmissions, recentEntries, teams] =
      await Promise.all([
        this.prisma.scrumEntry.findMany({
          where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, entryDate: { gte: today, lt: tomorrow }, deletedAt: null },
          select: { userId: true, submittedAt: true },
        }),
        this.prisma.scrumEntry.findMany({
          where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, entryDate: { gte: sevenDaysAgo, lt: tomorrow }, deletedAt: null },
          select: { entryDate: true, submittedAt: true },
        }),
        this.prisma.scrumBlocker.findMany({
          where: { tenantId: p.tenantId, organizationId: p.organizationId, status: 'OPEN', scrumEntry: { userId: { in: userIds } } },
          select: { severity: true, scrumEntry: { select: { userId: true } } },
        }),
        this.prisma.scrumBlocker.findMany({
          where: { tenantId: p.tenantId, organizationId: p.organizationId, status: 'RESOLVED', resolvedAt: { gte: sevenDaysAgoInstant }, scrumEntry: { userId: { in: userIds } } },
          select: { createdAt: true, resolvedAt: true },
        }),
        this.prisma.scrumEntry.count({
          where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, entryDate: { gte: sevenDaysAgo, lt: today }, isLocked: false, deletedAt: null },
        }),
        this.prisma.scrumEntry.findMany({
          where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, submittedAt: { not: null }, deletedAt: null },
          orderBy: { submittedAt: 'desc' },
          take: 10,
          select: {
            id: true, userId: true, progress: true, status: true, submittedAt: true,
            user: { select: { firstName: true, lastName: true, avatarKey: true, department: { select: { name: true } } } },
          },
        }),
        this.prisma.team.findMany({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            deletedAt: null,
            ...(scope.scope === 'team' ? { id: { in: teamIds } } : {}),
          },
          select: { id: true, name: true },
        }),
      ]);

    // Teams reporting: teams with at least one submission today, out of teams that have in-scope members.
    const teamsWithMembers = new Set(teamIds);
    const teamsSubmittedToday = new Set(
      users.filter((u) => u.teamId && todayEntries.some((e) => e.userId === u.id && e.submittedAt)).map((u) => u.teamId as string),
    );

    // Participation rate (today).
    const submittedTodayCount = todayEntries.filter((e) => e.submittedAt).length;
    const participationRate = userIds.length > 0 ? Math.round((submittedTodayCount / userIds.length) * 100) : 0;

    // Submission trend, last 7 days.
    const trendBuckets = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setUTCDate(d.getUTCDate() + i);
      trendBuckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of sevenDayEntries) {
      if (!e.submittedAt) continue;
      const key = e.entryDate.toISOString().slice(0, 10);
      if (trendBuckets.has(key)) trendBuckets.set(key, (trendBuckets.get(key) ?? 0) + 1);
    }
    const trendData = Array.from(trendBuckets.entries()).map(([date, count]) => ({ date, count }));
    const firstHalf = trendData.slice(0, 3).reduce((s, d) => s + d.count, 0);
    const secondHalf = trendData.slice(4).reduce((s, d) => s + d.count, 0);
    const direction: 'up' | 'down' | 'flat' = secondHalf > firstHalf ? 'up' : secondHalf < firstHalf ? 'down' : 'flat';

    // Blockers.
    const criticalBlockersCount = openBlockers.filter((b) => b.severity === 'CRITICAL').length;
    const blockedUserIds = new Set(openBlockers.map((b) => b.scrumEntry.userId));

    // Average blocker response time (creation → resolution), in hours.
    const avgBlockerResolutionHours =
      resolvedBlockers.length > 0
        ? +(
            resolvedBlockers.reduce((sum, b) => sum + (b.resolvedAt!.getTime() - b.createdAt.getTime()) / 3_600_000, 0) /
            resolvedBlockers.length
          ).toFixed(1)
        : null;

    // Team status rollup.
    const teamStatus = teams.map((team) => {
      const memberIds = users.filter((u) => u.teamId === team.id).map((u) => u.id);
      const submitted = todayEntries.filter((e) => memberIds.includes(e.userId) && e.submittedAt).length;
      const blocked = memberIds.some((id) => blockedUserIds.has(id));
      return {
        teamId: team.id,
        name: team.name,
        memberCount: memberIds.length,
        submittedCount: submitted,
        completionPercent: memberIds.length > 0 ? Math.round((submitted / memberIds.length) * 100) : 0,
        hasActiveBlocker: blocked,
      };
    });

    const recentAvatarUrls = await this.storage.signedUrlsByKey(recentEntries.map((e) => e.user.avatarKey));

    return {
      period: { from: sevenDaysAgo, to: today },
      teamsReporting: { count: teamsSubmittedToday.size, total: teamsWithMembers.size },
      participationRate,
      activeBlockers: { count: openBlockers.length, critical: criticalBlockersCount },
      submissionTrend: { data: trendData, direction },
      lateSubmissions,
      avgBlockerResolutionHours,
      recentSubmissions: recentEntries.map((e) => ({
        id: e.id,
        userId: e.userId,
        name: `${e.user.firstName} ${e.user.lastName}`,
        avatarUrl: e.user.avatarKey ? (recentAvatarUrls.get(e.user.avatarKey) ?? null) : null,
        department: e.user.department?.name ?? null,
        completionPercent: e.progress,
        status: e.status,
        submittedAt: e.submittedAt,
      })),
      teamStatus,
    };
  }

  /** Blocker Feed — open blockers by default, newest/most-severe first. */
  async blockers(p: AuthPrincipal, query: ScrumBlockersQuery) {
    const scope = await this.resolveScrumMgmtScope(p);
    const userIds = await this.scopeUserIds(p, scope);
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Prisma.ScrumBlockerWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      scrumEntry: { userId: { in: userIds } },
      ...(query.severity ? { severity: query.severity as BlockerSeverity } : {}),
      status: (query.status as BlockerStatus | undefined) ?? 'OPEN',
      ...(cursor ? { id: { gt: cursor } } : {}),
    };

    const rows = await this.prisma.scrumBlocker.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      include: {
        scrumEntry: {
          select: {
            entryDate: true,
            user: { select: { firstName: true, lastName: true, team: { select: { name: true } }, department: { select: { name: true } } } },
          },
        },
      },
    });

    const mapped = rows.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      severity: b.severity,
      status: b.status,
      createdAt: b.createdAt,
      resolvedAt: b.resolvedAt,
      employeeName: `${b.scrumEntry.user.firstName} ${b.scrumEntry.user.lastName}`,
      team: b.scrumEntry.user.team?.name ?? null,
      department: b.scrumEntry.user.department?.name ?? null,
      entryDate: b.scrumEntry.entryDate,
    }));

    return buildPage(mapped, limit);
  }

  /** Department participation rate over a period (default: today). */
  async participation(p: AuthPrincipal, query: ScrumMgmtQuery) {
    const scope = await this.resolveScrumMgmtScope(p);
    const { from, to } = await this.dateRangeOrToday(p, query);

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(scope.userIds ? { id: { in: scope.userIds } } : {}),
      },
      select: { id: true, departmentId: true, department: { select: { name: true } } },
    });
    const userIds = users.map((u) => u.id);

    const entries = await this.prisma.scrumEntry.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, entryDate: { gte: from, lte: to }, submittedAt: { not: null }, deletedAt: null },
      select: { userId: true },
    });
    const submittedUserIds = new Set(entries.map((e) => e.userId));

    const byDept = new Map<string, { name: string; total: number; submitted: number }>();
    for (const u of users) {
      const key = u.departmentId ?? 'unassigned';
      const bucket = byDept.get(key) ?? { name: u.department?.name ?? 'Unassigned', total: 0, submitted: 0 };
      bucket.total++;
      if (submittedUserIds.has(u.id)) bucket.submitted++;
      byDept.set(key, bucket);
    }

    return {
      period: { from, to },
      overall: userIds.length > 0 ? Math.round((submittedUserIds.size / userIds.length) * 100) : 0,
      byDepartment: Array.from(byDept.entries()).map(([departmentId, b]) => ({
        departmentId,
        name: b.name,
        total: b.total,
        submitted: b.submitted,
        participationRate: b.total > 0 ? Math.round((b.submitted / b.total) * 100) : 0,
      })),
    };
  }

  /** Department Heatmap — Mon–Fri submission-rate matrix for the current or previous week. */
  async heatmap(p: AuthPrincipal, query: { week?: string }) {
    const scope = await this.resolveScrumMgmtScope(p);
    const { weekStart, weekEnd, days } = await this.resolveWeek(p, query.week);

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(scope.userIds ? { id: { in: scope.userIds } } : {}),
      },
      select: { id: true, departmentId: true, department: { select: { name: true } } },
    });
    const userIds = users.map((u) => u.id);

    const entries = await this.prisma.scrumEntry.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, entryDate: { gte: weekStart, lte: weekEnd }, submittedAt: { not: null }, deletedAt: null },
      select: { userId: true, entryDate: true },
    });

    const usersByDept = new Map<string, { name: string; ids: string[] }>();
    for (const u of users) {
      const key = u.departmentId ?? 'unassigned';
      const bucket = usersByDept.get(key) ?? { name: u.department?.name ?? 'Unassigned', ids: [] };
      bucket.ids.push(u.id);
      usersByDept.set(key, bucket);
    }

    const departments = Array.from(usersByDept.entries()).map(([departmentId, { name, ids }]) => {
      const values = days.map((day) => {
        const submittedCount = entries.filter((e) => e.entryDate.toISOString().slice(0, 10) === day.date && ids.includes(e.userId)).length;
        return ids.length > 0 ? Math.round((submittedCount / ids.length) * 100) : 0;
      });
      const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      return { departmentId, name, values, avg };
    });

    return { days: days.map((d) => d.label), departments };
  }

  /** Submission Trend — daily submission counts/rate over the last N days (default 14). */
  async trends(p: AuthPrincipal, query: { days?: string }) {
    const scope = await this.resolveScrumMgmtScope(p);
    const days = Math.min(Math.max(Number(query.days ?? 14), 1), 90);

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(scope.userIds ? { id: { in: scope.userIds } } : {}),
      },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const totalUsers = userIds.length;

    const since = orgDateOnly(new Date(), await this.timeZones.forPrincipal(p));
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const entries = await this.prisma.scrumEntry.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, userId: { in: userIds }, entryDate: { gte: since }, submittedAt: { not: null }, deletedAt: null },
      select: { entryDate: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of entries) {
      const key = e.entryDate.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return {
      days,
      data: Array.from(buckets.entries()).map(([date, submitted]) => ({
        date,
        submitted,
        total: totalUsers,
        rate: totalUsers > 0 ? Math.round((submitted / totalUsers) * 100) : 0,
      })),
    };
  }

  /**
   * Find team scrum entries (Supervisor team scope or Admin org scope).
   */
  async findTeamScrums(p: AuthPrincipal, query: ScrumQuery & { search?: string }) {
    const scope = await this.resolveScrumMgmtScope(p);
    const userIds = await this.scopeUserIds(p, scope);
    const limit = Math.min(Number(query.limit ?? 10), 50);

    const where: Prisma.ScrumEntryWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      userId: { in: userIds },
      ...(query.hasBlockers === 'true' ? { blockerItems: { some: { status: 'OPEN' } } } : {}),
      ...(query.needsReview === 'true' ? { supervisorNote: null } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            entryDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const count = await this.prisma.scrumEntry.count({ where });
    const items = await this.prisma.scrumEntry.findMany({
      where,
      orderBy: { entryDate: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarKey: true, department: { select: { name: true } } } },
        tasks: {
          where: { deletedAt: null },
          include: { project: { select: { name: true } } },
        },
        blockerItems: true,
      },
    });

    // Attach recurring blocker indicator
    await this.attachRecurringBlockerFlag(items as any);

    // `avatarKey` was already selected here but never exchanged for a URL, so
    // the submissions list could only ever render initials.
    const avatarUrls = await this.storage.signedUrlsByKey(items.map((i) => i.user.avatarKey));

    return {
      data: items.map((i) => ({ ...i, user: withAvatarUrl(i.user, avatarUrls) })),
      total: count,
      limit,
    };
  }

  /**
   * For each entry, compute whether the employee has reported blockers on
   * 3+ of their last 5 scrum entries (excluding the current one).
   */
  private async attachRecurringBlockerFlag(
    entries: (ScrumEntry & { user: any; tasks: any[]; blockerItems: any[] })[],
  ): Promise<void> {
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const promises = userIds.map(async (userId) => {
      const recent = await this.prisma.scrumEntry.findMany({
        where: { tenantId: entries[0].tenantId, userId, deletedAt: null },
        orderBy: { entryDate: 'desc' },
        take: 5,
        include: { blockerItems: { where: { status: 'OPEN' } } },
      });

      const blockedCount = recent.filter((r) => r.blockerItems.length > 0).length;
      return { userId, recurringBlocker: blockedCount >= 3 };
    });
    const flags = await Promise.all(promises);
    const flagMap = Object.fromEntries(flags.map((f) => [f.userId, f.recurringBlocker]));

    for (const entry of entries) {
      (entry as any).recurringBlocker = flagMap[entry.userId] ?? false;
    }
  }

  /**
   * Supervisor flags a scrum entry as recurring issue, writing audit logs and notifying the employee.
   */
  async flagScrumEntry(p: AuthPrincipal, id: string, version: number): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');

    if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      throw new ForbiddenException('Only supervisors can flag team scrum entries');
    }

    if (!(await this.isInTeam(p, entry.userId))) {
      throw new ForbiddenException('This entry is outside your team');
    }

    if (entry.version !== version) throw new ConflictException('Version mismatch');

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: 'ADMIN_ACTION',
        entityType: 'ScrumEntry',
        entityId: id,
        metadata: {
          flagged: true,
          reason: 'Recurring issue flagged by supervisor',
        },
      },
    });

    // Notify employee
    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: entry.userId,
      senderId: p.userId,
      type: 'SCRUM_ENTRY_LOCKED',
      category: 'DAILY_SCRUM',
      title: 'Scrum plan flagged',
      message: 'Your supervisor flagged a recurring issue on your recent daily scrum entry.',
      actionUrl: `/time-tracking?scrum=${id}`,
      actionLabel: 'View Scrum',
    });

    return this.prisma.scrumEntry.update({
      where: { id },
      data: {
        status: 'BLOCKED',
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async resolveUserFilter(
    p: AuthPrincipal,
    requestedUserId?: string,
  ): Promise<Prisma.ScrumEntryWhereInput> {
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (requestedUserId && !ids.includes(requestedUserId)) {
        throw new ForbiddenException('That user is outside your team');
      }
      return { userId: requestedUserId ?? { in: ids } };
    }
    if (requestedUserId && requestedUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own scrum entries');
    }
    return { userId: p.userId };
  }

  private async assertCanView(p: AuthPrincipal, ownerId: string): Promise<void> {
    if (ownerId === p.userId) return;
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      if ((await this.teamUserIds(p)).includes(ownerId)) return;
    }
    throw new ForbiddenException('Not permitted to view this scrum entry');
  }

  /**
   * Who may reopen a locked entry — and therefore who may decline the request to
   * reopen it. Admin (org scope, via wildcard) may act org-wide; a Supervisor
   * (team scope) only on members of the department(s) they head — department
   * isolation. Anyone else is refused.
   */
  private async assertCanUnlock(p: AuthPrincipal, ownerId: string): Promise<void> {
    if (this.can(p, PERMISSIONS.SCRUM_READ_ORG)) return;
    if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      throw new ForbiddenException('Only supervisors can unlock team scrum entries');
    }
    if (!(await this.isInTeam(p, ownerId))) {
      throw new ForbiddenException('This entry is outside your team');
    }
  }

  private async isInTeam(p: AuthPrincipal, userId: string): Promise<boolean> {
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
      return (await this.teamUserIds(p)).includes(userId);
    }
    return false;
  }

  /** Department-based supervision scope (Department.managerId). */
  private teamUserIds(p: AuthPrincipal): Promise<string[]> {
    return this.deptScope.teamUserIds(p);
  }

  /** Admin sees the whole org; Supervisor sees their direct-report chain; anyone else is refused. */
  private async resolveScrumMgmtScope(p: AuthPrincipal): Promise<ScrumMgmtScope> {
    if (this.can(p, PERMISSIONS.SCRUM_READ_ORG)) return { scope: 'org' };
    if (this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) return { scope: 'team', userIds: await this.teamUserIds(p) };
    throw new ForbiddenException('Daily Scrum Management is available to Supervisors and Admins only');
  }

  private async scopeUserIds(p: AuthPrincipal, scope: ScrumMgmtScope): Promise<string[]> {
    if (scope.userIds) return scope.userIds;
    const users = await this.prisma.user.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Today as a `ScrumEntry.entryDate` value. entryDate is a date-only column
   * naming the employee's local day, so "today" must be the organization's local
   * day — a UTC-derived one pointed at yesterday until 08:00 Manila, which made
   * the whole Daily Scrum dashboard read a day behind every morning.
   */
  private async todayDate(p: AuthPrincipal): Promise<Date> {
    return orgDateOnly(new Date(), await this.timeZones.forPrincipal(p));
  }

  private async dateRangeOrToday(p: AuthPrincipal, query: ScrumMgmtQuery): Promise<{ from: Date; to: Date }> {
    const from = query.from ? new Date(query.from) : await this.todayDate(p);
    const to = query.to ? new Date(query.to) : new Date();
    return { from, to };
  }

  /** Mon–Fri of the current or previous ISO week, in the organization's timezone. */
  private async resolveWeek(
    p: AuthPrincipal,
    week?: string,
  ): Promise<{ weekStart: Date; weekEnd: Date; days: { date: string; label: string }[] }> {
    const timeZone = await this.timeZones.forPrincipal(p);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const dayKeys = orgWeekDays(new Date(), timeZone, week === 'previous' ? -1 : 0, 5);
    const days = labels.map((label, i) => ({ date: dayKeys[i], label }));

    // entryDate is date-only, so the bounds are day values, not instants.
    return {
      weekStart: new Date(`${dayKeys[0]}T00:00:00.000Z`),
      weekEnd: new Date(`${dayKeys[4]}T00:00:00.000Z`),
      days,
    };
  }

  private async ownEntry(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    if (entry.userId !== p.userId) {
      throw new ForbiddenException('You can only modify your own scrum entries');
    }
    return entry;
  }

  private async entryForView(p: AuthPrincipal, id: string): Promise<ScrumEntry> {
    const entry = await this.prisma.scrumEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Scrum entry not found');
    await this.assertCanView(p, entry.userId);
    return entry;
  }

  private async ownTask(p: AuthPrincipal, id: string): Promise<ScrumTask> {
    const task = await this.prisma.scrumTask.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!task) throw new NotFoundException('Scrum task not found');
    if (task.employeeId !== p.userId) {
      throw new ForbiddenException('You can only modify your own scrum tasks');
    }
    return task;
  }

  private async ownBlocker(p: AuthPrincipal, id: string): Promise<ScrumBlocker> {
    const blocker = await this.prisma.scrumBlocker.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId },
    });
    if (!blocker) throw new NotFoundException('Scrum blocker not found');
    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: blocker.scrumEntryId } });
    if (!entry || entry.userId !== p.userId) {
      throw new ForbiddenException('You can only modify your own scrum blockers');
    }
    return blocker;
  }

  /**
   * A COMPLETED commitment is a submitted record — the employee cannot edit the
   * plan or delete it. Reopening goes through the supervisor unlock
   * (`unlockEntry`), which returns the day's tasks to IN_PROGRESS.
   */
  private assertTaskNotCompleted(task: ScrumTask): void {
    if (task.taskStatus === 'COMPLETED') {
      throw new ConflictException(
        'This commitment is completed and locked. Ask your supervisor to unlock the day to change it.',
      );
    }
  }

  private async assertEntryUnlocked(scrumEntryId: string): Promise<void> {
    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: scrumEntryId } });
    if (entry?.isLocked) throw new ForbiddenException(LOCKED_MESSAGE);
  }

  /**
   * BUG-BP: guards every mutation that re-shapes a saved plan — adding, editing
   * or deleting a commitment or a blocker. The escape hatch is the supervisor's
   * approval, exactly as for a locked day: an APPROVED edit request on this
   * entry re-opens the plan (`unlockEntry` also clears `planLockedAt` outright
   * when it reopens a fully locked day).
   */
  private async assertPlanEditable(scrumEntryId: string): Promise<void> {
    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: scrumEntryId } });
    if (!entry?.planLockedAt) return;
    const approved = await this.prisma.scrumEditRequest.findFirst({
      where: { scrumEntryId, status: 'APPROVED', deletedAt: null },
    });
    if (!approved) throw new ForbiddenException(PLAN_LOCKED_MESSAGE);
  }

  private async validateProjectRef(p: AuthPrincipal, projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!project) throw new UnprocessableEntityException('Invalid projectId');
  }

  /**
   * When a task links to a real KPI template, `kpi` (display name) is always
   * resolved from the template. `suggestedTarget` is the admin's master target
   * formatted as a string — used as a pre-fill suggestion for the employee's
   * Planned Target, but the employee can override it with their own value.
   */
  private async resolveKpiTemplateFields(
    p: AuthPrincipal,
    kpiTemplateId?: string | null,
  ): Promise<{ kpi: string; suggestedTarget: string } | null> {
    if (!kpiTemplateId) return null;
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id: kpiTemplateId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!template) throw new UnprocessableEntityException('Invalid kpiTemplateId');
    const target = Number(template.targetValue);
    return {
      kpi: template.name,
      suggestedTarget: template.unit ? `${target} ${template.unit}` : `${target}`,
    };
  }

  /**
   * Ports ScrumTaskCard's client-side `updateScrumProgressAndStatus` to the server:
   * progress = round(completed/total*100); 100% locks the day, >0% is IN_PROGRESS.
   */
  private async recalcEntryProgress(scrumEntryId: string, actorId: string): Promise<void> {
    const tasks = await this.prisma.scrumTask.findMany({
      where: { scrumEntryId, deletedAt: null },
      select: { taskStatus: true },
    });
    const total = tasks.length;
    const completed = tasks.filter((t) => t.taskStatus === 'COMPLETED').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const status = progress === 100 ? 'COMPLETED' : progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
    const isLocked = progress === 100;

    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: scrumEntryId } });
    if (!entry) return;

    const justLocked = isLocked && !entry.submittedAt;

    // Deliberately does NOT bump `version`. These are derived fields recomputed
    // from the task rows, not a user edit of the entry — bumping here invalidated
    // the optimistic-lock token held by whoever triggered the task write, so a
    // client that wrote tasks and then updated the entry (the End of Day Review)
    // always 409'd against a version it had itself just invalidated. The lock
    // still guards real edits to yesterday/today/blockers/notes via update().
    await this.prisma.scrumEntry.update({
      where: { id: scrumEntryId },
      data: {
        progress,
        status,
        isLocked,
        submittedAt: justLocked ? new Date() : entry.submittedAt,
        updatedBy: actorId,
      },
    });

    if (justLocked) {
      await this.notifySupervisorOf(entry.userId, entry.tenantId, entry.organizationId, {
        type: 'SCRUM_ENTRY_LOCKED',
        title: 'Daily Scrum submitted',
        message: 'An employee completed all of today\'s scrum tasks and their entry is now locked.',
      });
    }
  }

  /** Notifies the given user's supervisor, if they have one — a no-op otherwise (no fabricated recipient). */
  private async notifySupervisorOf(
    userId: string,
    tenantId: string,
    organizationId: string,
    input: {
      type: 'SCRUM_ENTRY_LOCKED' | 'SCRUM_BLOCKER_ADDED';
      title: string;
      message: string;
      actionUrl?: string;
      actionLabel?: string;
    },
  ): Promise<void> {
    const employee = await this.prisma.user.findFirst({ where: { id: userId }, select: { supervisorId: true } });
    if (!employee?.supervisorId) return;
    await this.notifications.create({
      tenantId,
      organizationId,
      userId: employee.supervisorId,
      senderId: userId,
      type: input.type,
      category: 'DAILY_SCRUM',
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl ?? '/time-tracking',
      actionLabel: input.actionLabel ?? 'View Scrum',
    });
  }
}
