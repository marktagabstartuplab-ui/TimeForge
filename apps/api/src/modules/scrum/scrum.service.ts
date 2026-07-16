import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ScrumEntry, ScrumTask, ScrumBlocker, BlockerSeverity, BlockerStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { PERMISSIONS } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CommentScrumEntryDto,
  CreateScrumBlockerDto,
  CreateScrumEntryDto,
  CreateScrumTaskDto,
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

@Injectable()
export class ScrumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly deptScope: DepartmentScopeService,
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
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.scrumEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { id: 'asc' }],
      take: limit + 1,
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

  // ── Writes ──────────────────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateScrumEntryDto): Promise<ScrumEntry> {
    const entryDate = new Date(dto.entryDate);
    if (isNaN(entryDate.getTime())) {
      throw new UnprocessableEntityException('entryDate must be a valid date');
    }

    // entryDate must not be in the future. Clients send their *local* calendar
    // date, which for timezones ahead of UTC (e.g. UTC+8) is one day ahead of
    // the server's UTC date between local midnight and local 08:00 — a strict
    // UTC comparison rejected every scrum save in that window ("entryDate
    // cannot be in the future"), blocking the whole Daily Scrum/EOD workflow.
    // Allow one day of timezone grace (local offsets max out under +14h).
    const latestAllowed = new Date();
    latestAllowed.setUTCDate(latestAllowed.getUTCDate() + 1);
    latestAllowed.setUTCHours(23, 59, 59, 999);
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
    if (entry.version !== dto.version) throw new ConflictException('Version mismatch');

    return this.prisma.scrumEntry.update({
      where: { id },
      data: {
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

    // Admin (org scope, via wildcard) may unlock any entry org-wide. A Supervisor
    // (team scope) may only unlock entries owned by a member of the department(s)
    // they head — department isolation. Anyone else is refused.
    if (!this.can(p, PERMISSIONS.SCRUM_READ_ORG)) {
      if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM)) {
        throw new ForbiddenException('Only supervisors can unlock team scrum entries');
      }
      if (!(await this.isInTeam(p, entry.userId))) {
        throw new ForbiddenException('This entry is outside your team');
      }
    }

    if (!entry.isLocked) {
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

    const updated = await this.prisma.scrumEntry.update({
      where: { id },
      data: {
        isLocked: false,
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
          event: 'SCRUM_ENTRY_UNLOCKED',
          reason,
          employeeId: entry.userId,
          departmentId: owner?.departmentId ?? null,
          entryDate: entry.entryDate.toISOString(),
        },
      },
    });

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: entry.userId,
      senderId: p.userId,
      type: 'ANNOUNCEMENT',
      category: 'DAILY_SCRUM',
      title: "Today's Commitment unlocked",
      message: `Your supervisor unlocked today's commitment so you can edit it again. Reason: ${reason}`,
      actionUrl: `/time-tracking?scrum=${id}`,
      actionLabel: 'Edit Scrum',
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
    if (entry.isLocked) throw new ConflictException('Today\'s scrum plan is locked');
    await this.validateProjectRef(p, dto.projectId);

    const task = await this.prisma.scrumTask.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumEntryId: entry.id,
        employeeId: p.userId,
        title: dto.title,
        description: dto.description ?? null,
        expectedOutput: dto.expectedOutput,
        measurement: dto.measurement,
        projectId: dto.projectId ?? null,
        priority: dto.priority ?? 'MEDIUM',
        kpi: dto.kpi ?? null,
        plannedTarget: dto.plannedTarget ?? null,
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
    await this.assertEntryUnlocked(task.scrumEntryId);
    await this.validateProjectRef(p, dto.projectId);

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
        kpi: dto.kpi !== undefined ? (dto.kpi ?? null) : task.kpi,
        plannedTarget: dto.plannedTarget !== undefined ? (dto.plannedTarget ?? null) : task.plannedTarget,
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
    if (task.version !== version) throw new ConflictException('Version mismatch');
    if (task.taskStatus === 'COMPLETED') return task;
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
    await this.assertEntryUnlocked(task.scrumEntryId);
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
    if (entry.isLocked) throw new ConflictException('Today\'s scrum plan is locked');

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
    await this.prisma.scrumBlocker.delete({ where: { id } });
  }

  // ── Daily Scrum Management dashboard (Supervisor: team scope, Admin: org scope) ──

  /** KPI cards + Recent Submissions + Team Status. */
  async dashboard(p: AuthPrincipal, query: ScrumMgmtQuery) {
    const scope = await this.resolveScrumMgmtScope(p);
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

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
          where: { tenantId: p.tenantId, organizationId: p.organizationId, status: 'RESOLVED', resolvedAt: { gte: sevenDaysAgo }, scrumEntry: { userId: { in: userIds } } },
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
            user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
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
    const { from, to } = this.dateRangeOrToday(query);

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
    const { weekStart, weekEnd, days } = this.resolveWeek(query.week);

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

    const since = this.startOfDay(new Date());
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
        tasks: { where: { deletedAt: null } },
        blockerItems: true,
      },
    });

    // Attach recurring blocker indicator
    await this.attachRecurringBlockerFlag(items as any);

    return {
      data: items,
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

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private dateRangeOrToday(query: ScrumMgmtQuery): { from: Date; to: Date } {
    const from = query.from ? new Date(query.from) : this.startOfDay(new Date());
    const to = query.to ? new Date(query.to) : new Date();
    return { from, to };
  }

  private startOfIsoWeek(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
    if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
    return d;
  }

  /** Mon–Fri of the current or previous ISO week. */
  private resolveWeek(week?: string): { weekStart: Date; weekEnd: Date; days: { date: string; label: string }[] } {
    const monday = this.startOfIsoWeek(new Date());
    if (week === 'previous') monday.setUTCDate(monday.getUTCDate() - 7);

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const days = labels.map((label, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), label };
    });

    const weekEnd = new Date(monday);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);
    weekEnd.setUTCHours(23, 59, 59, 999);

    return { weekStart: monday, weekEnd, days };
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

  private async assertEntryUnlocked(scrumEntryId: string): Promise<void> {
    const entry = await this.prisma.scrumEntry.findFirst({ where: { id: scrumEntryId } });
    if (entry?.isLocked) throw new ConflictException("Today's scrum plan is locked");
  }

  private async validateProjectRef(p: AuthPrincipal, projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!project) throw new UnprocessableEntityException('Invalid projectId');
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

    await this.prisma.scrumEntry.update({
      where: { id: scrumEntryId },
      data: {
        progress,
        status,
        isLocked,
        submittedAt: justLocked ? new Date() : entry.submittedAt,
        updatedBy: actorId,
        version: { increment: 1 },
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
    input: { type: 'SCRUM_ENTRY_LOCKED' | 'SCRUM_BLOCKER_ADDED'; title: string; message: string },
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
      actionUrl: '/time-tracking',
      actionLabel: 'View Scrum',
    });
  }
}
