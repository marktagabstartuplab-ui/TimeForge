import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { buildPage, decodeCursor } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';

export interface DashboardQuery {
  from?: string;
  to?: string;
  departmentId?: string;
  teamId?: string;
  projectId?: string;
  userId?: string;
  status?: string;
  periodKey?: string;
  limit?: string;
  cursor?: string;
}

type Scope = 'self' | 'team' | 'org';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private hasAny(user: AuthPrincipal, ...perms: string[]): boolean {
    if (user.permissions.includes('*')) return true;
    return perms.some((p) => user.permissions.includes(p));
  }

  private requireAdmin(user: AuthPrincipal): void {
    if (!this.hasAny(user, 'dashboard:read_admin')) {
      throw new ForbiddenException('System Overview is available to Admins only');
    }
  }

  private resolveScope(user: AuthPrincipal): Scope {
    if (this.hasAny(user, 'dashboard:read_org'))  return 'org';
    if (this.hasAny(user, 'dashboard:read_team')) return 'team';
    if (this.hasAny(user, 'dashboard:read_self')) return 'self';
    throw new ForbiddenException('Missing dashboard permission');
  }

  private requireAny(user: AuthPrincipal, ...perms: string[]): void {
    if (!this.hasAny(user, ...perms)) {
      throw new ForbiddenException('Missing required permission');
    }
  }

  // ─── Date range helpers ───────────────────────────────────────────────────

  private dateRange(query: DashboardQuery) {
    const from = query.from ? new Date(query.from) : this.startOfCurrentMonth();
    const to   = query.to   ? new Date(query.to)   : new Date();
    return { from, to };
  }

  private startOfCurrentMonth(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private toIsoWeek(date: Date): string {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const year = d.getUTCFullYear();
    const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  // ─── Scope → userIds helper ───────────────────────────────────────────────

  private async resolveUserIds(
    tenantId: string,
    user: AuthPrincipal,
    scope: Scope,
    query: DashboardQuery,
  ): Promise<string[] | undefined> {
    let userIds: string[] | undefined;

    if (scope === 'self') {
      userIds = [user.userId];
    } else if (scope === 'team') {
      const teamUsers = await this.prisma.user.findMany({
        where: { tenantId, supervisorId: user.userId, deletedAt: null },
        select: { id: true },
      });
      userIds = [user.userId, ...teamUsers.map((u) => u.id)];
    }

    // Department / team filter narrows further
    if (query.departmentId || query.teamId) {
      const filtered = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.teamId       ? { teamId:       query.teamId }       : {}),
        },
        select: { id: true },
      });
      const filteredIds = filtered.map((u) => u.id);
      userIds = userIds
        ? userIds.filter((id) => filteredIds.includes(id))
        : filteredIds;
    }

    if (query.userId) {
      userIds = userIds
        ? userIds.filter((id) => id === query.userId)
        : [query.userId];
    }

    return userIds;
  }

  // ─── Dashboard: Summary (KPI cards) ──────────────────────────────────────

  async summary(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    const scope = this.resolveScope(user);
    const { from, to } = this.dateRange(query);
    const userIds = await this.resolveUserIds(tenantId, user, scope, query);

    const tsWhere: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      periodStart: { gte: from },
      periodEnd:   { lte: to },
    };
    if (userIds) tsWhere['userId'] = { in: userIds };

    const timesheets = await this.prisma.timesheet.groupBy({
      by: ['status'],
      where: tsWhere,
      _count: { id: true },
      _sum: { totalMinutes: true },
    });

    const byStatus: Record<string, number> = {};
    let totalMinutes = 0;
    let approvedMinutes = 0;
    for (const row of timesheets) {
      byStatus[row.status] = row._count.id;
      totalMinutes += row._sum.totalMinutes ?? 0;
      if (row.status === 'APPROVED') approvedMinutes += row._sum.totalMinutes ?? 0;
    }

    let kpi: unknown[] = [];
    if (scope === 'self') {
      kpi = await this.prisma.kpiProgress.findMany({
        where: { tenantId, userId: user.userId, deletedAt: null },
        orderBy: { periodKey: 'desc' },
        take: 10,
        select: {
          id: true,
          periodKey: true,
          currentValue: true,
          targetValue: true,
          kpiTemplate: { select: { name: true, metricType: true, period: true } },
        },
      });
    }

    let activeUsers: number | undefined;
    if (scope === 'org') {
      activeUsers = await this.prisma.user.count({
        where: { tenantId, status: 'ACTIVE', deletedAt: null },
      });
    }

    return {
      scope,
      period: { from, to },
      timesheets: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        byStatus,
      },
      hours: { totalMinutes, approvedMinutes },
      ...(kpi.length       ? { kpi }         : {}),
      ...(activeUsers !== undefined ? { activeUsers } : {}),
    };
  }

  // ─── Dashboard: Progress (Today's Hours, Weekly Hours, Completion %, KPI) ──
  //
  // Employee Dashboard "Today's Progress" widget — every number computed
  // server-side from WorkSession/TimeEntry/ScrumTask, no frontend math.

  async progress(tenantId: string, user: AuthPrincipal) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const weekStart = this.startOfIsoWeek(now);

    const [todayEntries, weekEntries, todaySessions, weekTasks] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { tenantId, userId: user.userId, deletedAt: null, startTime: { gte: todayStart } },
        select: { startTime: true, endTime: true, durationMinutes: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { tenantId, userId: user.userId, deletedAt: null, startTime: { gte: weekStart } },
        select: { durationMinutes: true, startTime: true, endTime: true },
      }),
      this.prisma.workSession.findMany({
        where: { tenantId, userId: user.userId, workDate: { gte: todayStart } },
        select: { breakMinutes: true },
      }),
      this.prisma.scrumTask.findMany({
        where: {
          tenantId,
          employeeId: user.userId,
          deletedAt: null,
          scrumEntry: { entryDate: { gte: weekStart } },
        },
        select: { taskStatus: true },
      }),
    ]);

    const minutesOf = (rows: { startTime: Date; endTime: Date | null; durationMinutes: number | null }[]) =>
      rows.reduce((sum, e) => sum + (e.durationMinutes ?? Math.max(0, Math.round((now.getTime() - e.startTime.getTime()) / 60_000))), 0);

    const todayMinutes = minutesOf(todayEntries);
    const weekMinutes = minutesOf(weekEntries);
    const breakMinutesToday = todaySessions.reduce((sum, s) => sum + s.breakMinutes, 0);

    const totalTasks = weekTasks.length;
    const completedTasks = weekTasks.filter((t) => t.taskStatus === 'COMPLETED').length;
    const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const productivityPercent =
      todayMinutes + breakMinutesToday > 0
        ? Math.round((todayMinutes / (todayMinutes + breakMinutesToday)) * 100)
        : 0;

    const kpi = await this.prisma.kpiProgress.findMany({
      where: { tenantId, userId: user.userId, deletedAt: null },
      orderBy: { periodKey: 'desc' },
      take: 10,
      select: {
        id: true,
        periodKey: true,
        currentValue: true,
        targetValue: true,
        kpiTemplate: { select: { name: true, metricType: true, period: true } },
      },
    });

    return {
      todayHoursMinutes: todayMinutes,
      weeklyHoursMinutes: weekMinutes,
      breakMinutesToday,
      completedTasks,
      totalTasks,
      completionPercent,
      productivityPercent,
      kpi,
    };
  }

  private startOfIsoWeek(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
    if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
    return d;
  }

  // ─── Dashboard: Pending Approvals ─────────────────────────────────────────

  async pendingApprovals(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'approval:read', 'approval:decide', 'dashboard:read_org', 'dashboard:read_team');

    // Supervisors see their own team's pending; org readers see all.
    const isOrgLevel = this.hasAny(user, 'approval:read', 'dashboard:read_org');

    const tsWhere: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      status: 'SUBMITTED',
    };

    if (!isOrgLevel) {
      const teamUsers = await this.prisma.user.findMany({
        where: { tenantId, supervisorId: user.userId, deletedAt: null },
        select: { id: true },
      });
      tsWhere['userId'] = { in: teamUsers.map((u) => u.id) };
    }

    if (query.departmentId || query.teamId) {
      const filtered = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.teamId       ? { teamId:       query.teamId }       : {}),
        },
        select: { id: true },
      });
      const filteredIds = filtered.map((u) => u.id);
      const existing = tsWhere['userId'] as { in: string[] } | undefined;
      tsWhere['userId'] = existing
        ? { in: existing.in.filter((id) => filteredIds.includes(id)) }
        : { in: filteredIds };
    }

    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const rows = await this.prisma.timesheet.findMany({
      where: tsWhere,
      orderBy: { submittedAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        periodStart: true,
        periodEnd: true,
        totalMinutes: true,
        submittedAt: true,
        status: true,
      },
    });

    const count = await this.prisma.timesheet.count({ where: tsWhere });

    return { total: count, ...buildPage(rows, limit) };
  }

  // ─── Dashboard: Attendance ────────────────────────────────────────────────

  async attendance(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'attendance:read_org', 'dashboard:read_org');

    const { from, to } = this.dateRange(query);

    const tsWhere: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      periodStart: { gte: from },
      periodEnd:   { lte: to },
    };

    if (query.departmentId || query.teamId) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.teamId       ? { teamId:       query.teamId }       : {}),
        },
        select: { id: true },
      });
      tsWhere['userId'] = { in: users.map((u) => u.id) };
    }

    const timesheets = await this.prisma.timesheet.findMany({
      where: tsWhere,
      select: { periodStart: true, status: true },
      orderBy: { periodStart: 'asc' },
    });

    const buckets = new Map<string, { total: number; submitted: number; approved: number }>();
    for (const ts of timesheets) {
      const weekKey = this.toIsoWeek(ts.periodStart);
      const bucket = buckets.get(weekKey) ?? { total: 0, submitted: 0, approved: 0 };
      bucket.total++;
      if (['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PAYROLL_READY'].includes(ts.status)) {
        bucket.submitted++;
      }
      if (['APPROVED', 'PAYROLL_READY'].includes(ts.status)) {
        bucket.approved++;
      }
      buckets.set(weekKey, bucket);
    }

    const data = Array.from(buckets.entries()).map(([week, counts]) => ({
      week,
      ...counts,
      submissionRate: counts.total > 0 ? +(counts.submitted / counts.total * 100).toFixed(1) : 0,
      approvalRate:   counts.total > 0 ? +(counts.approved  / counts.total * 100).toFixed(1) : 0,
    }));

    return { period: { from, to }, data };
  }

  // ─── Dashboard: Payroll Status ────────────────────────────────────────────

  async payrollStatus(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'payroll:read', 'dashboard:read_org');

    const { from, to } = this.dateRange(query);
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      startDate: { gte: from },
      endDate:   { lte: to },
    };
    if (query.status) where['status'] = query.status;

    const rows = await this.prisma.payrollPeriod.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        lockedAt: true,
        exportedAt: true,
      },
    });

    const byStatus = await this.prisma.payrollPeriod.groupBy({
      by: ['status'],
      where: { tenantId, deletedAt: null },
      _count: { id: true },
    });

    return {
      summary: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
      ...buildPage(rows, limit),
    };
  }

  // ─── Dashboard: Team Summary ──────────────────────────────────────────────

  async teamSummary(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'dashboard:read_team', 'dashboard:read_org');

    const { from, to } = this.dateRange(query);
    const isOrg = this.hasAny(user, 'dashboard:read_org');

    const userWhere: Record<string, unknown> = { tenantId, deletedAt: null, status: 'ACTIVE' };
    if (!isOrg) userWhere['supervisorId'] = user.userId;
    if (query.departmentId) userWhere['departmentId'] = query.departmentId;
    if (query.teamId)       userWhere['teamId']       = query.teamId;

    const members = await this.prisma.user.findMany({
      where: userWhere,
      select: { id: true, firstName: true, lastName: true, employmentType: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    if (!members.length) return { members: [] };

    const memberIds = members.map((m) => m.id);

    // Aggregate hours and timesheet status per member
    const [timesheetGroups, kpiGroups] = await Promise.all([
      this.prisma.timesheet.groupBy({
        by: ['userId', 'status'],
        where: {
          tenantId,
          deletedAt: null,
          userId: { in: memberIds },
          periodStart: { gte: from },
          periodEnd:   { lte: to },
        },
        _sum: { totalMinutes: true },
        _count: { id: true },
      }),
      this.prisma.kpiProgress.groupBy({
        by: ['userId'],
        where: {
          tenantId,
          deletedAt: null,
          userId: { in: memberIds },
          ...(query.periodKey ? { periodKey: query.periodKey } : {}),
        },
        _avg: { currentValue: true, targetValue: true },
      }),
    ]);

    // Index by userId
    const tsByUser = new Map<string, { totalMinutes: number; byStatus: Record<string, number> }>();
    for (const row of timesheetGroups) {
      const existing = tsByUser.get(row.userId) ?? { totalMinutes: 0, byStatus: {} };
      existing.totalMinutes += row._sum.totalMinutes ?? 0;
      existing.byStatus[row.status] = (existing.byStatus[row.status] ?? 0) + row._count.id;
      tsByUser.set(row.userId, existing);
    }
    const kpiByUser = new Map(kpiGroups.map((r) => [r.userId, r]));

    return {
      period: { from, to },
      members: members.map((m) => {
        const ts = tsByUser.get(m.id);
        const kpi = kpiByUser.get(m.id);
        return {
          userId:       m.id,
          name:         `${m.firstName} ${m.lastName}`,
          employmentType: m.employmentType,
          totalMinutes: ts?.totalMinutes ?? 0,
          timesheetsByStatus: ts?.byStatus ?? {},
          kpiAvgCurrent: kpi?._avg.currentValue ?? null,
          kpiAvgTarget:  kpi?._avg.targetValue  ?? null,
        };
      }),
    };
  }

  // ─── Dashboard: Productivity (report) ────────────────────────────────────

  async productivity(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'dashboard:read_team', 'dashboard:read_org');

    const { from, to } = this.dateRange(query);

    const teWhere: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      startTime: { gte: from, lte: to },
    };

    if (!this.hasAny(user, 'dashboard:read_org')) {
      const teamUsers = await this.prisma.user.findMany({
        where: { tenantId, supervisorId: user.userId, deletedAt: null },
        select: { id: true },
      });
      teWhere['userId'] = { in: [user.userId, ...teamUsers.map((u) => u.id)] };
    }

    if (query.departmentId || query.teamId) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.teamId       ? { teamId:       query.teamId }       : {}),
        },
        select: { id: true },
      });
      const filteredIds = users.map((u) => u.id);
      const existing = teWhere['userId'] as { in: string[] } | undefined;
      teWhere['userId'] = existing
        ? { in: existing.in.filter((id) => filteredIds.includes(id)) }
        : { in: filteredIds };
    }

    if (query.projectId) teWhere['projectId'] = query.projectId;

    const [byUser, byProject] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['userId'],
        where: teWhere,
        _sum: { durationMinutes: true },
        _count: { id: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['projectId'],
        where: { ...teWhere, projectId: { not: null } },
        _sum: { durationMinutes: true },
        _count: { id: true },
      }),
    ]);

    const userIds = byUser.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const projectIds = byProject.map((r) => r.projectId).filter(Boolean) as string[];
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    return {
      period: { from, to },
      byUser: byUser.map((r) => {
        const u = userMap.get(r.userId);
        return {
          userId: r.userId,
          name: u ? `${u.firstName} ${u.lastName}` : r.userId,
          totalMinutes: r._sum.durationMinutes ?? 0,
          entryCount: r._count.id,
        };
      }),
      byProject: byProject.map((r) => ({
        projectId: r.projectId,
        name: r.projectId ? (projectMap.get(r.projectId)?.name ?? r.projectId) : 'Unassigned',
        totalMinutes: r._sum.durationMinutes ?? 0,
        entryCount: r._count.id,
      })),
    };
  }

  // ─── Report: Timesheets ───────────────────────────────────────────────────

  async reportTimesheets(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'timesheet:read_org', 'dashboard:read_org', 'approval:read');

    const { from, to } = this.dateRange(query);
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      periodStart: { gte: from },
      periodEnd:   { lte: to },
    };
    if (query.status)       where['status']  = query.status;
    if (query.userId)       where['userId']  = query.userId;
    if (query.departmentId || query.teamId) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.teamId       ? { teamId:       query.teamId }       : {}),
        },
        select: { id: true },
      });
      where['userId'] = { in: users.map((u) => u.id) };
    }

    const rows = await this.prisma.timesheet.findMany({
      where,
      orderBy: { periodStart: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { firstName: true, lastName: true, employmentType: true } },
      },
    });

    // Aggregation totals for the full filter (no pagination)
    const agg = await this.prisma.timesheet.aggregate({
      where,
      _sum:   { totalMinutes: true },
      _count: { id: true },
    });

    return {
      totals: {
        count: agg._count.id,
        totalMinutes: agg._sum.totalMinutes ?? 0,
      },
      ...buildPage(rows, limit),
    };
  }

  // ─── Report: Payroll ──────────────────────────────────────────────────────

  async reportPayroll(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'payroll:read', 'dashboard:read_org');

    const { from, to } = this.dateRange(query);
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      startDate: { gte: from },
      endDate:   { lte: to },
    };
    if (query.status) where['status'] = query.status;

    const rows = await this.prisma.payrollPeriod.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        reports: {
          select: { id: true, generatedBy: true, exportPdfKey: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const statusCounts = await this.prisma.payrollPeriod.groupBy({
      by: ['status'],
      where: { tenantId, deletedAt: null, startDate: { gte: from }, endDate: { lte: to } },
      _count: { id: true },
    });

    return {
      summary: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
      ...buildPage(rows, limit),
    };
  }

  // ─── Report: KPI ──────────────────────────────────────────────────────────

  async reportKpi(tenantId: string, user: AuthPrincipal, query: DashboardQuery) {
    this.requireAny(user, 'kpi:read_org', 'dashboard:read_org', 'dashboard:read_team');

    const isOrg = this.hasAny(user, 'kpi:read_org', 'dashboard:read_org');
    const limit  = Math.min(Number(query.limit ?? 50), 200);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (!isOrg) {
      const teamUsers = await this.prisma.user.findMany({
        where: { tenantId, supervisorId: user.userId, deletedAt: null },
        select: { id: true },
      });
      where['userId'] = { in: [user.userId, ...teamUsers.map((u) => u.id)] };
    }
    if (query.userId)    where['userId']    = query.userId;
    if (query.periodKey) where['periodKey'] = query.periodKey;
    if (query.teamId || query.departmentId) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          ...(query.teamId       ? { teamId:       query.teamId }       : {}),
        },
        select: { id: true },
      });
      where['userId'] = { in: users.map((u) => u.id) };
    }

    const rows = await this.prisma.kpiProgress.findMany({
      where,
      orderBy: [{ periodKey: 'desc' }, { userId: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        periodKey: true,
        currentValue: true,
        targetValue: true,
        kpiTemplate: { select: { name: true, metricType: true, period: true } },
        user:        { select: { firstName: true, lastName: true } },
      },
    });

    return buildPage(rows, limit);
  }

  // ─── Admin: System Overview ───────────────────────────────────────────────
  //
  // Powers the Admin-only "System Overview" dashboard. Aggregate counts are
  // cached (expensive at scale); live health/latency numbers are always
  // measured fresh so the health widget reflects the current moment.

  async adminOverview(tenantId: string, user: AuthPrincipal) {
    this.requireAdmin(user);
    const apiStart = Date.now();

    const cacheKey = 'admin:overview:counts';
    let counts = await this.cache.get<{
      activeUsers: number;
      organizations: number;
      pendingApprovals: number;
      payrollStatus: Record<string, number>;
      todayTimesheets: number;
      activeSessions: number;
    }>(cacheKey);

    if (!counts) {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

      const [activeUsers, organizations, pendingApprovals, payrollByStatus, todayTimesheets, activeSessions] =
        await Promise.all([
          this.prisma.user.count({ where: { tenantId, status: 'ACTIVE', deletedAt: null } }),
          this.prisma.organization.count({ where: { tenantId, deletedAt: null } }),
          this.prisma.timesheet.count({ where: { tenantId, status: 'SUBMITTED', deletedAt: null } }),
          this.prisma.payrollPeriod.groupBy({ by: ['status'], where: { tenantId, deletedAt: null }, _count: { id: true } }),
          this.prisma.timesheet.count({
            where: { tenantId, deletedAt: null, submittedAt: { gte: todayStart, lt: tomorrowStart } },
          }),
          this.prisma.refreshToken.count({
            where: { tenantId, revokedAt: null, expiresAt: { gt: now } },
          }),
        ]);

      counts = {
        activeUsers,
        organizations,
        pendingApprovals,
        payrollStatus: Object.fromEntries(payrollByStatus.map((r) => [r.status, r._count.id])),
        todayTimesheets,
        activeSessions,
      };
      await this.cache.set(cacheKey, counts, 30);
    }

    const dbStart = Date.now();
    let databaseLatency: number;
    let systemHealth: 'healthy' | 'degraded' | 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseLatency = Date.now() - dbStart;
      // Remote-hosted Postgres (Supabase) typically round-trips in the low
      // hundreds of ms even when healthy — only flag as degraded once it's
      // noticeably slower than that baseline.
      systemHealth = databaseLatency < 500 ? 'healthy' : 'degraded';
    } catch {
      databaseLatency = Date.now() - dbStart;
      systemHealth = 'down';
    }

    return {
      systemHealth,
      uptimeSeconds: Math.floor(process.uptime()),
      ...counts,
      apiLatency: Date.now() - apiStart,
      databaseLatency,
    };
  }

  // ─── Admin: Daily Activity (chart) ────────────────────────────────────────

  async adminActivity(tenantId: string, user: AuthPrincipal, query: { days?: string }) {
    this.requireAdmin(user);
    const days = Math.min(Math.max(Number(query.days ?? 14), 1), 90);

    const cacheKey = `admin:activity:${days}`;
    const cached = await this.cache.get<{ days: number; data: { date: string; count: number }[] }>(cacheKey);
    if (cached) return cached;

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const events = await this.prisma.auditLog.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const result = {
      days,
      data: Array.from(buckets.entries()).map(([date, count]) => ({ date, count })),
    };
    await this.cache.set(cacheKey, result, 60);
    return result;
  }

  // ─── Admin: Charts (Employee Growth + Organization Statistics) ───────────

  async adminCharts(tenantId: string, user: AuthPrincipal) {
    this.requireAdmin(user);

    const cacheKey = 'admin:charts';
    const cached = await this.cache.get<{
      employeeGrowth: { month: string; newUsers: number }[];
      organizationStats: { departments: number; teams: number; projects: number; clients: number };
    }>(cacheKey);
    if (cached) return cached;

    const monthsBack = 6;
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (monthsBack - 1));

    const organizationId = user.organizationId;
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const monthBuckets = new Map<string, number>();
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(since);
      d.setUTCMonth(d.getUTCMonth() + i);
      monthBuckets.set(d.toISOString().slice(0, 7), 0);
    }
    for (const u of users) {
      const key = u.createdAt.toISOString().slice(0, 7);
      if (monthBuckets.has(key)) monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + 1);
    }

    const [departments, teams, projects, clients] = await Promise.all([
      this.prisma.department.count({ where: { tenantId, organizationId, deletedAt: null } }),
      this.prisma.team.count({ where: { tenantId, organizationId, deletedAt: null } }),
      this.prisma.project.count({ where: { tenantId, organizationId, deletedAt: null } }),
      this.prisma.client.count({ where: { tenantId, organizationId, deletedAt: null } }),
    ]);

    const result = {
      employeeGrowth: Array.from(monthBuckets.entries()).map(([month, newUsers]) => ({ month, newUsers })),
      organizationStats: { departments, teams, projects, clients },
    };
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  // ─── Admin: Recent Activity ───────────────────────────────────────────────

  async adminRecent(tenantId: string, user: AuthPrincipal) {
    this.requireAdmin(user);
    return this.recentActivity(tenantId);
  }

  private async recentActivity(tenantId: string) {
    const [auditLogs, approvals, payrollGenerations, userRegistrations] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.approval.findMany({
        where: { tenantId },
        orderBy: { actedAt: 'desc' },
        take: 10,
        include: {
          supervisor: { select: { firstName: true, lastName: true } },
          timesheet: { select: { userId: true, periodStart: true, periodEnd: true } },
        },
      }),
      this.prisma.payrollReport.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { period: { select: { type: true, startDate: true, endDate: true } } },
      }),
      this.prisma.user.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true, status: true, createdAt: true },
      }),
    ]);

    return { auditLogs, approvals, payrollGenerations, userRegistrations };
  }

  // ─── HR Dashboard ──────────────────────────────────────────────────────────
  // Real database aggregates only — the "AI" framing (efficiency score, executive
  // summary, action recommendations) is deterministic text/number generation from
  // live KPI, payroll, and timesheet data, persisted as an AiJob/AiResult on
  // explicit "Generate New Report", matching the convention used elsewhere
  // (see KpiService.submitCoaching).

  /** Throttled to once per user per day so polling/refetching doesn't spam the audit trail. */
  private async auditDashboardAccess(tenantId: string, user: AuthPrincipal, entityType: string): Promise<void> {
    const cacheKey = `hr:audited:${entityType}:${user.userId}:${new Date().toISOString().slice(0, 10)}`;
    const already = await this.cache.get<boolean>(cacheKey);
    if (already) return;
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType,
        metadata: { event: 'HR_DASHBOARD_VIEWED' },
      },
    });
    await this.cache.set(cacheKey, true, 86_400);
  }

  private countWeekdays(from: Date, to: Date, holidayDates: Set<string> = new Set()): number {
    let count = 0;
    const d = new Date(from);
    while (d <= to) {
      const day = d.getUTCDay();
      const key = d.toISOString().slice(0, 10);
      if (day !== 0 && day !== 6 && !holidayDates.has(key)) count++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return Math.max(1, count);
  }

  /** The most recent payroll period (if any) plus its line items, for period-scoped totals. */
  private async latestPayrollLineItems(tenantId: string, organizationId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { tenantId, organizationId, deletedAt: null },
      orderBy: { startDate: 'desc' },
    });
    if (!period) return { period: null, lineItems: [] as { userId: string; estimatedPay: unknown; overtimeHours: unknown; approvedHours: unknown }[] };

    const reports = await this.prisma.payrollReport.findMany({
      where: { tenantId, organizationId, payrollPeriodId: period.id, deletedAt: null },
      select: { id: true },
    });
    if (reports.length === 0) return { period, lineItems: [] };

    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: { tenantId, organizationId, payrollReportId: { in: reports.map((r) => r.id) } },
      select: { userId: true, estimatedPay: true, overtimeHours: true, approvedHours: true },
    });
    return { period, lineItems };
  }

  async hrSummary(tenantId: string, user: AuthPrincipal) {
    this.requireAny(user, 'dashboard:read_org');
    const organizationId = user.organizationId;

    const cacheKey = `hr:summary:${organizationId}`;
    let result = await this.cache.get<{
      totalPayroll: number;
      activeEmployees: number;
      pendingTimesheets: number;
      aiEfficiencyScore: number;
      payrollPeriod: { startDate: string; endDate: string; status: string } | null;
    }>(cacheKey);

    if (!result) {
      const [activeEmployees, pendingTimesheets, { period, lineItems }, kpiRows] = await Promise.all([
        this.prisma.user.count({ where: { tenantId, organizationId, status: 'ACTIVE', deletedAt: null } }),
        this.prisma.timesheet.count({ where: { tenantId, organizationId, status: 'SUBMITTED', deletedAt: null } }),
        this.latestPayrollLineItems(tenantId, organizationId),
        this.prisma.kpiProgress.findMany({
          where: { tenantId, organizationId, deletedAt: null },
          select: { currentValue: true, targetValue: true },
        }),
      ]);

      const totalPayroll = +lineItems.reduce((sum, li) => sum + Number(li.estimatedPay), 0).toFixed(2);
      const totalCurrent = kpiRows.reduce((s, k) => s + Number(k.currentValue), 0);
      const totalTarget = kpiRows.reduce((s, k) => s + Number(k.targetValue), 0);
      const aiEfficiencyScore = totalTarget > 0 ? Math.min(100, +((totalCurrent / totalTarget) * 100).toFixed(1)) : 0;

      result = {
        totalPayroll,
        activeEmployees,
        pendingTimesheets,
        aiEfficiencyScore,
        payrollPeriod: period
          ? { startDate: period.startDate.toISOString(), endDate: period.endDate.toISOString(), status: period.status }
          : null,
      };
      await this.cache.set(cacheKey, result, 30);
    }

    await this.auditDashboardAccess(tenantId, user, 'hr_dashboard');
    return result;
  }

  async hrDepartments(tenantId: string, user: AuthPrincipal) {
    this.requireAny(user, 'dashboard:read_org');
    const organizationId = user.organizationId;

    const cacheKey = `hr:departments:${organizationId}`;
    const cached = await this.cache.get<
      { id: string; name: string; headcount: number; payrollAllocation: number; attendanceRate: number; efficiency: number; status: string }[]
    >(cacheKey);
    if (cached) return cached;

    const [departments, users, { lineItems }] = await Promise.all([
      this.prisma.department.findMany({
        where: { tenantId, organizationId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId, organizationId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, departmentId: true },
      }),
      this.latestPayrollLineItems(tenantId, organizationId),
    ]);

    const allUserIds = users.map((u) => u.id);
    const usersByDept = new Map<string, string[]>();
    for (const u of users) {
      if (!u.departmentId) continue;
      const list = usersByDept.get(u.departmentId) ?? [];
      list.push(u.id);
      usersByDept.set(u.departmentId, list);
    }

    const [kpiRows, timesheetGroups] = await Promise.all([
      this.prisma.kpiProgress.findMany({
        where: { tenantId, organizationId, deletedAt: null, userId: { in: allUserIds } },
        select: { userId: true, currentValue: true, targetValue: true },
      }),
      this.prisma.timesheet.groupBy({
        by: ['userId', 'status'],
        where: { tenantId, organizationId, deletedAt: null, userId: { in: allUserIds } },
        _count: { id: true },
      }),
    ]);

    const kpiByUser = new Map<string, { current: number; target: number }>();
    for (const k of kpiRows) {
      const e = kpiByUser.get(k.userId) ?? { current: 0, target: 0 };
      e.current += Number(k.currentValue);
      e.target += Number(k.targetValue);
      kpiByUser.set(k.userId, e);
    }
    const payByUser = new Map<string, number>();
    for (const li of lineItems) {
      payByUser.set(li.userId, (payByUser.get(li.userId) ?? 0) + Number(li.estimatedPay));
    }
    const tsByUser = new Map<string, { total: number; approved: number }>();
    for (const g of timesheetGroups) {
      const e = tsByUser.get(g.userId) ?? { total: 0, approved: 0 };
      e.total += g._count.id;
      if (g.status === 'APPROVED' || g.status === 'PAYROLL_READY') e.approved += g._count.id;
      tsByUser.set(g.userId, e);
    }

    const rows = departments.map((d) => {
      const memberIds = usersByDept.get(d.id) ?? [];
      let payrollAllocation = 0;
      let tsTotal = 0;
      let tsApproved = 0;
      let kpiCurrent = 0;
      let kpiTarget = 0;
      for (const uid of memberIds) {
        payrollAllocation += payByUser.get(uid) ?? 0;
        const ts = tsByUser.get(uid);
        if (ts) {
          tsTotal += ts.total;
          tsApproved += ts.approved;
        }
        const kpi = kpiByUser.get(uid);
        if (kpi) {
          kpiCurrent += kpi.current;
          kpiTarget += kpi.target;
        }
      }
      const attendanceRate = tsTotal > 0 ? +((tsApproved / tsTotal) * 100).toFixed(1) : 0;
      const efficiency = kpiTarget > 0 ? Math.min(100, +((kpiCurrent / kpiTarget) * 100).toFixed(1)) : 0;
      const status = efficiency >= 95 ? 'OPTIMIZED' : efficiency >= 80 ? 'ON_TRACK' : 'NEEDS_REVIEW';
      return {
        id: d.id,
        name: d.name,
        headcount: memberIds.length,
        payrollAllocation: +payrollAllocation.toFixed(2),
        attendanceRate,
        efficiency,
        status,
      };
    });

    await this.cache.set(cacheKey, rows, 60);
    return rows;
  }

  async hrRecent(tenantId: string, user: AuthPrincipal) {
    this.requireAny(user, 'dashboard:read_org');
    return this.recentActivity(tenantId);
  }

  // ─── HR AI Insights ───────────────────────────────────────────────────────

  async hrAiInsights(tenantId: string, user: AuthPrincipal) {
    this.requireAny(user, 'dashboard:read_org');
    const organizationId = user.organizationId;

    const cacheKey = `hr:ai-insights:${organizationId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const [activePeriod, employees, recentTimesheets, departmentsList, aiJobs, payrollPeriods, kpiProgress, aiResults] =
      await Promise.all([
        this.prisma.payrollPeriod.findFirst({
          where: { tenantId, organizationId, deletedAt: null, status: { in: ['OPEN', 'GENERATED', 'LOCKED'] } },
          orderBy: { startDate: 'desc' },
          select: { id: true, type: true, status: true, startDate: true, endDate: true },
        }),
        this.prisma.user.findMany({
          where: { tenantId, organizationId, status: 'ACTIVE', deletedAt: null },
          select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } },
        }),
        this.prisma.timesheet.findMany({
          where: { tenantId, organizationId, deletedAt: null },
          select: { id: true, status: true, totalMinutes: true, periodStart: true, periodEnd: true, userId: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        this.prisma.department.findMany({
          where: { tenantId, organizationId, deletedAt: null },
          select: { id: true, name: true },
        }),
        this.prisma.aiJob.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, feature: true, status: true, createdAt: true, errorMsg: true },
        }),
        this.prisma.payrollPeriod.findMany({
          where: { tenantId, organizationId, deletedAt: null },
          orderBy: { startDate: 'desc' },
          take: 12,
          select: { id: true, status: true, startDate: true, endDate: true },
        }),
        this.prisma.kpiProgress.findMany({
          where: { tenantId, organizationId, deletedAt: null },
          select: { currentValue: true, targetValue: true },
        }),
        this.prisma.aiResult.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, aiJobId: true, confidence: true, createdAt: true },
        }),
      ]);

    // ── Summary Cards ──
    const periodLabel = activePeriod
      ? `${activePeriod.type.replace('_', ' ')} — ${activePeriod.startDate.toISOString().slice(0, 10)} to ${activePeriod.endDate.toISOString().slice(0, 10)}`
      : null;

    let workforceCost = 0;
    if (activePeriod) {
      const lineItems = await this.prisma.payrollLineItem.findMany({
        where: { tenantId, organizationId, payrollReport: { payrollPeriodId: activePeriod.id } },
        select: { estimatedPay: true },
      });
      workforceCost = +lineItems.reduce((s, li) => s + Number(li.estimatedPay), 0).toFixed(2);
    }

    const totalTs = recentTimesheets.length;
    const approvedTs = recentTimesheets.filter((t) => ['APPROVED', 'PAYROLL_READY'].includes(t.status)).length;
    const timesheetCompliance = totalTs > 0 ? +((approvedTs / totalTs) * 100).toFixed(1) : 0;

    const totalKpiCurrent = kpiProgress.reduce((s, k) => s + Number(k.currentValue), 0);
    const totalKpiTarget = kpiProgress.reduce((s, k) => s + Number(k.targetValue), 0);
    const aiEfficiencyGain = totalKpiTarget > 0 ? Math.min(100, +((totalKpiCurrent / totalKpiTarget) * 100).toFixed(1)) : 0;

    // ── Payroll Oversight Hub ──
    const hasPayrollReady = recentTimesheets.some((t) => t.status === 'PAYROLL_READY');
    const hasSubmitted = recentTimesheets.some((t) => t.status !== 'DRAFT');
    const hasPayrollValidation = aiJobs.some((j) => j.feature === 'PAYROLL_VALIDATION' && j.status === 'SUCCEEDED');
    const hasRunningValidation = aiJobs.some((j) => j.feature === 'PAYROLL_VALIDATION' && j.status === 'RUNNING');
    const hasGenerated = payrollPeriods.some((p) => p.status === 'GENERATED');
    const hasLocked = payrollPeriods.some((p) => p.status === 'LOCKED' || p.status === 'EXPORTED');

    const dataSyncStatus = hasPayrollReady ? 'COMPLETED' : hasSubmitted ? 'IN_PROGRESS' : 'PENDING';
    const aiValStatus = hasPayrollValidation ? 'COMPLETED' : hasRunningValidation ? 'IN_PROGRESS' : 'PENDING';
    const payrollProcStatus = hasLocked ? 'COMPLETED' : hasGenerated ? 'IN_PROGRESS' : 'PENDING';
    const financeStatus = hasLocked ? 'READY' : hasGenerated ? 'IN_PROGRESS' : 'NOT_READY';

    const validationJob = aiJobs.find((j) => j.feature === 'PAYROLL_VALIDATION' && j.status === 'SUCCEEDED');

    // ── AI Action Center ──
    const actionItems: {
      id: string; type: string; severity: string; title: string; description: string; timestamp: string;
    }[] = [];

    const overtimeSheets = recentTimesheets.filter((t) => {
      const days = Math.max(1, Math.round((t.periodEnd.getTime() - t.periodStart.getTime()) / 86_400_000) + 1);
      return t.totalMinutes > 3600 * (days / 7);
    });
    if (overtimeSheets.length > 0) {
      actionItems.push({
        id: 'overtime-alert', type: 'PAYROLL_ALERT',
        severity: overtimeSheets.length > 5 ? 'HIGH' : 'MEDIUM',
        title: `${overtimeSheets.length} employee${overtimeSheets.length > 1 ? 's' : ''} exceed${overtimeSheets.length === 1 ? 's' : ''} overtime threshold`,
        description: `${overtimeSheets.length} timesheet${overtimeSheets.length > 1 ? 's' : ''} flagged for overtime. Review for payroll adjustments.`,
        timestamp: new Date().toISOString(),
      });
    }

    const overdueSheets = recentTimesheets.filter((t) => t.status === 'DRAFT' && t.periodEnd < new Date());
    if (overdueSheets.length > 0) {
      actionItems.push({
        id: 'overdue-alert', type: 'COMPLIANCE_RISK',
        severity: overdueSheets.length > 10 ? 'HIGH' : 'MEDIUM',
        title: `${overdueSheets.length} overdue timesheet${overdueSheets.length > 1 ? 's' : ''} require${overdueSheets.length === 1 ? 's' : ''} submission`,
        description: `Follow up with employees to avoid payroll delays.`,
        timestamp: new Date().toISOString(),
      });
    }

    const revisionSheets = recentTimesheets.filter((t) => t.status === 'REVISION_REQUESTED');
    if (revisionSheets.length > 0) {
      actionItems.push({
        id: 'revision-alert', type: 'RECOMMENDED_ACTION', severity: 'MEDIUM',
        title: `${revisionSheets.length} revision${revisionSheets.length > 1 ? 's' : ''} pending resubmission`,
        description: `Timesheets awaiting revision response.`,
        timestamp: new Date().toISOString(),
      });
    }

    const failedAiJobs = aiJobs.filter((j) => j.status === 'FAILED');
    if (failedAiJobs.length > 0) {
      actionItems.push({
        id: 'ai-failure', type: 'CRITICAL_ERROR', severity: 'HIGH',
        title: `${failedAiJobs.length} AI job${failedAiJobs.length > 1 ? 's' : ''} failed`,
        description: failedAiJobs[0]?.errorMsg ?? 'Check AI logs for details.',
        timestamp: failedAiJobs[0]?.createdAt.toISOString() ?? new Date().toISOString(),
      });
    }

    const lowConfidenceResult = aiResults.find((r) => r.confidence !== null && Number(r.confidence) < 0.7);
    if (lowConfidenceResult) {
      actionItems.push({
        id: 'low-confidence', type: 'COMPLIANCE_RISK', severity: 'MEDIUM',
        title: `Payroll validation confidence below threshold`,
        description: `Confidence is ${(Number(lowConfidenceResult.confidence) * 100).toFixed(1)}%. Manual review recommended.`,
        timestamp: lowConfidenceResult.createdAt.toISOString(),
      });
    }

    const attendanceData = await this.attendance(tenantId, user, {});
    const lowApprovalWeeks = attendanceData.data.filter((d: any) => d.approvalRate < 70);
    if (lowApprovalWeeks.length > 0) {
      actionItems.push({
        id: 'attendance-anomaly', type: 'ATTENDANCE_ANOMALY',
        severity: lowApprovalWeeks.length > 2 ? 'HIGH' : 'MEDIUM',
        title: `Low attendance approval in ${lowApprovalWeeks.length} week${lowApprovalWeeks.length > 1 ? 's' : ''}`,
        description: `Approval rate below 70%. Investigate approval bottlenecks.`,
        timestamp: new Date().toISOString(),
      });
    }

    actionItems.sort((a, b) => {
      const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

    // ── Timesheet Status Rows ──
    const userMap = new Map(employees.map((e) => [e.id, e]));
    const timesheetStatusRows = recentTimesheets.slice(0, 50).map((t) => {
      const emp = userMap.get(t.userId);
      const isOvertime = (() => {
        const days = Math.max(1, Math.round((t.periodEnd.getTime() - t.periodStart.getTime()) / 86_400_000) + 1);
        return t.totalMinutes > 3600 * (days / 7);
      })();
      const isOverdue = t.status === 'DRAFT' && t.periodEnd < new Date();
      let validationResult = 'Passed';
      if (isOvertime) validationResult = 'Overtime Warning';
      else if (isOverdue) validationResult = 'Overdue';
      else if (t.status === 'REVISION_REQUESTED') validationResult = 'Revision Needed';
      else if (t.status === 'REJECTED') validationResult = 'Rejected';
      return {
        id: t.id,
        employee: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        department: emp?.department?.name ?? 'Unassigned',
        period: `${t.periodStart.toISOString().slice(0, 10)} - ${t.periodEnd.toISOString().slice(0, 10)}`,
        status: t.status,
        aiFlagged: isOvertime || isOverdue || t.status === 'REVISION_REQUESTED' || t.status === 'REJECTED',
        validationResult,
      };
    });

    // ── Attendance Trends ──
    const trends = attendanceData.data.map((d: any) => ({
      week: d.week,
      submissionRate: d.submissionRate,
      approvalRate: d.approvalRate,
      anomalies: d.approvalRate < 70 ? 1 : 0,
    }));

    const result = {
      summaryCards: {
        activePayrollCycle: activePeriod
          ? { label: periodLabel, startDate: activePeriod.startDate.toISOString(), endDate: activePeriod.endDate.toISOString(), status: activePeriod.status }
          : null,
        estimatedWorkforceCost: workforceCost,
        totalEmployees: employees.length,
        timesheetCompliance,
        aiEfficiencyGain,
      },
      payrollOversight: {
        dataSync: { status: dataSyncStatus, lastSync: null },
        aiValidation: { status: aiValStatus, lastRun: validationJob?.createdAt.toISOString() ?? null },
        payrollProcessing: { status: payrollProcStatus, progress: hasLocked ? 100 : hasGenerated ? 50 : hasPayrollReady ? 25 : 0 },
        readyForFinance: { status: financeStatus, reportCount: payrollPeriods.filter((p) => p.status === 'LOCKED' || p.status === 'EXPORTED').length },
      },
      aiActionCenter: { totalAlerts: actionItems.length, items: actionItems },
      timesheetStatus: timesheetStatusRows,
      attendanceTrends: trends,
    };

    await this.cache.set(cacheKey, result, 60);
    await this.auditDashboardAccess(tenantId, user, 'hr_ai_insights');
    return result;
  }

  async hrExecutiveSummary(tenantId: string, user: AuthPrincipal, forceRegenerate = false) {
    this.requireAny(user, 'dashboard:read_org');
    const organizationId = user.organizationId;
    const cacheKey = `hr:executive-summary:${organizationId}`;

    if (!forceRegenerate) {
      const cached = await this.cache.get<{
        utilization: number;
        summary: string;
        actionRecommendations: string[];
        forecastedRisk: { overtimeRisk: string; turnoverProbability: string };
        generatedAt: string;
      }>(cacheKey);
      if (cached) return cached;
    }

    const [{ lineItems }, activeEmployees, pendingTimesheets, departments] = await Promise.all([
      this.latestPayrollLineItems(tenantId, organizationId),
      this.prisma.user.count({ where: { tenantId, organizationId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.timesheet.count({ where: { tenantId, organizationId, status: 'SUBMITTED', deletedAt: null } }),
      this.hrDepartments(tenantId, user),
    ]);

    const totalOvertime = lineItems.reduce((s, li) => s + Number(li.overtimeHours), 0);
    const totalApproved = lineItems.reduce((s, li) => s + Number(li.approvedHours), 0);
    const overtimeRatio = totalOvertime + totalApproved > 0 ? totalOvertime / (totalOvertime + totalApproved) : 0;
    const overtimeRisk = overtimeRatio > 0.15 ? 'HIGH' : overtimeRatio > 0.07 ? 'MEDIUM' : 'LOW';

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);
    const departedRecently = await this.prisma.user.count({
      where: {
        tenantId,
        organizationId,
        status: { in: ['SUSPENDED', 'DEACTIVATED'] },
        updatedAt: { gte: ninetyDaysAgo },
      },
    });
    const turnoverRatio = activeEmployees > 0 ? departedRecently / activeEmployees : 0;
    const turnoverProbability = turnoverRatio > 0.1 ? 'HIGH' : turnoverRatio > 0.03 ? 'MEDIUM' : 'LOW';

    const startOfMonth = this.startOfCurrentMonth();
    const now = new Date();
    const workedAgg = await this.prisma.timeEntry.aggregate({
      where: { tenantId, organizationId, deletedAt: null, startTime: { gte: startOfMonth, lte: now } },
      _sum: { durationMinutes: true },
    });
    const workedMinutes = workedAgg._sum.durationMinutes ?? 0;
    const expectedMinutes = activeEmployees * this.countWeekdays(startOfMonth, now) * 8 * 60;
    const utilization = expectedMinutes > 0 ? Math.min(100, +((workedMinutes / expectedMinutes) * 100).toFixed(1)) : 0;

    const atRiskDept = [...departments].filter((d) => d.status === 'NEEDS_REVIEW').sort((a, b) => a.efficiency - b.efficiency)[0];

    const actionRecommendations: string[] = [];
    if (atRiskDept) {
      actionRecommendations.push(
        `Review staffing and workload distribution in ${atRiskDept.name} (efficiency at ${atRiskDept.efficiency}%).`,
      );
    }
    if (overtimeRisk !== 'LOW') {
      actionRecommendations.push(`Reduce overtime exposure — ${(overtimeRatio * 100).toFixed(1)}% of approved hours are overtime.`);
    }
    if (pendingTimesheets > 0) {
      actionRecommendations.push(`Approve ${pendingTimesheets} pending timesheet${pendingTimesheets === 1 ? '' : 's'} awaiting review.`);
    }
    if (turnoverProbability !== 'LOW') {
      actionRecommendations.push(
        `Investigate retention risk — ${departedRecently} employee${departedRecently === 1 ? '' : 's'} exited in the last 90 days.`,
      );
    }
    if (actionRecommendations.length === 0) {
      actionRecommendations.push('Workforce metrics are within healthy thresholds — no immediate action required.');
    }

    const summary =
      `Overall workforce utilization is at ${utilization}%. ` +
      (atRiskDept ? `AI analysis suggests a potential bottleneck in the ${atRiskDept.name} department due to below-target efficiency. ` : '') +
      `Overtime risk is ${overtimeRisk.toLowerCase()} and turnover probability is ${turnoverProbability.toLowerCase()}.`;

    const result = {
      utilization,
      summary,
      actionRecommendations,
      forecastedRisk: { overtimeRisk, turnoverProbability },
      generatedAt: new Date().toISOString(),
    };
    await this.cache.set(cacheKey, result, 60);
    return result;
  }

  async hrGenerateReport(tenantId: string, user: AuthPrincipal) {
    this.requireAny(user, 'dashboard:read_org');
    const result = await this.hrExecutiveSummary(tenantId, user, true);

    const job = await this.prisma.aiJob.create({
      data: {
        tenantId,
        feature: 'PRODUCTIVITY_INSIGHT',
        subjectId: user.organizationId,
        subjectType: 'Organization',
        status: 'SUCCEEDED',
      },
    });
    await this.prisma.aiResult.create({
      data: {
        tenantId,
        aiJobId: job.id,
        summary: result.summary,
        recommendation: result.actionRecommendations.join(' '),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'hr_dashboard_report',
        metadata: { event: 'HR_REPORT_GENERATED', generatedAt: result.generatedAt },
      },
    });

    return result;
  }

  async hrExportCsv(tenantId: string, user: AuthPrincipal): Promise<string> {
    this.requireAny(user, 'dashboard:read_org');
    const [summary, departments] = await Promise.all([
      this.hrSummary(tenantId, user),
      this.hrDepartments(tenantId, user),
    ]);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'hr_dashboard_export',
        metadata: { event: 'HR_DASHBOARD_EXPORTED', generatedAt: new Date().toISOString() },
      },
    });

    const lines = [
      'Metric,Value',
      `Total Payroll,${summary.totalPayroll}`,
      `Active Employees,${summary.activeEmployees}`,
      `Pending Timesheets,${summary.pendingTimesheets}`,
      `AI Efficiency Score,${summary.aiEfficiencyScore}`,
      '',
      'Department,Headcount,Payroll Allocation,Attendance Rate,Efficiency,Status',
      ...departments.map((d) => `${d.name},${d.headcount},${d.payrollAllocation},${d.attendanceRate}%,${d.efficiency}%,${d.status}`),
    ];
    return lines.join('\n');
  }

  // ─── Admin: Export (audited) ──────────────────────────────────────────────

  async adminExport(tenantId: string, user: AuthPrincipal) {
    this.requireAdmin(user);

    const [overview, charts, recent] = await Promise.all([
      this.adminOverview(tenantId, user),
      this.adminCharts(tenantId, user),
      this.adminRecent(tenantId, user),
    ]);

    const snapshot = { generatedAt: new Date().toISOString(), overview, charts, recent };

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'system_overview_export',
        metadata: { generatedAt: snapshot.generatedAt },
      },
    });

    return snapshot;
  }

  // ─── Reports: Attendance ────────────────────────────────────────────────────
  // Derived entirely from real TimeEntry/Shift/Holiday data — there is no
  // dedicated Attendance model. "Days logged" = distinct calendar dates with a
  // time entry; "tardiness" compares the day's earliest entry against that
  // day's PUBLISHED shift start (grace period below); "absences" = expected
  // weekdays (excluding org holidays) minus days logged.

  private readonly ATTENDANCE_GRACE_MINUTES = 10;

  private attendanceStatus(absences: number, tardiness: number, attendancePercent: number, daysLogged: number, expectedDays: number): 'PERFECT' | 'EXCELLENT' | 'GOOD' | 'CRITICAL' {
    if (absences >= 3 || tardiness >= 3 || attendancePercent < 70) return 'CRITICAL';
    if (absences === 0 && tardiness === 0 && daysLogged >= expectedDays) return 'PERFECT';
    if (attendancePercent >= 95) return 'EXCELLENT';
    return 'GOOD';
  }

  /** Resolves the report window: an explicit payroll period, or from/to query params, or current month. */
  private async resolveAttendanceRange(tenantId: string, organizationId: string, query: Record<string, string>): Promise<{ from: Date; to: Date }> {
    if (query.payrollPeriodId) {
      const period = await this.prisma.payrollPeriod.findFirst({
        where: { id: query.payrollPeriodId, tenantId, organizationId, deletedAt: null },
      });
      if (!period) throw new NotFoundException('Payroll period not found');
      return { from: period.startDate, to: period.endDate };
    }
    return this.dateRange(query);
  }

  private async computeAttendanceRows(tenantId: string, user: AuthPrincipal, query: Record<string, string>) {
    const organizationId = user.organizationId;
    const { from, to } = await this.resolveAttendanceRange(tenantId, organizationId, query);

    const userWhere: Record<string, unknown> = {
      tenantId,
      organizationId,
      deletedAt: null,
      status: 'ACTIVE',
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.userId ? { id: query.userId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      return { rows: [] as any[], from, to };
    }

    const [holidays, entries, shifts] = await Promise.all([
      this.prisma.holiday.findMany({
        where: { tenantId, organizationId, deletedAt: null, date: { gte: from, lte: to } },
        select: { date: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { tenantId, organizationId, deletedAt: null, userId: { in: userIds }, startTime: { gte: from, lte: to } },
        select: { userId: true, startTime: true },
      }),
      this.prisma.shift.findMany({
        where: { tenantId, organizationId, deletedAt: null, userId: { in: userIds }, shiftDate: { gte: from, lte: to }, status: 'PUBLISHED' },
        select: { userId: true, shiftDate: true, startTime: true },
      }),
    ]);

    const holidayDates = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    const expectedDays = this.countWeekdays(from, to, holidayDates);

    const daysByUser = new Map<string, Set<string>>();
    const earliestByUserDate = new Map<string, Date>();
    for (const e of entries) {
      const dateKey = e.startTime.toISOString().slice(0, 10);
      const set = daysByUser.get(e.userId) ?? new Set<string>();
      set.add(dateKey);
      daysByUser.set(e.userId, set);
      const key = `${e.userId}|${dateKey}`;
      const existing = earliestByUserDate.get(key);
      if (!existing || e.startTime < existing) earliestByUserDate.set(key, e.startTime);
    }

    const shiftsByUserDate = new Map<string, Date>();
    for (const s of shifts) {
      shiftsByUserDate.set(`${s.userId}|${s.shiftDate.toISOString().slice(0, 10)}`, s.startTime);
    }

    const rows = users.map((u) => {
      const daysLogged = daysByUser.get(u.id)?.size ?? 0;
      const absences = Math.max(0, expectedDays - daysLogged);

      let tardiness = 0;
      for (const [key, scheduledStart] of shiftsByUserDate.entries()) {
        if (!key.startsWith(`${u.id}|`)) continue;
        const actualStart = earliestByUserDate.get(key);
        if (actualStart && actualStart.getTime() > scheduledStart.getTime() + this.ATTENDANCE_GRACE_MINUTES * 60_000) {
          tardiness++;
        }
      }

      const attendancePercent = expectedDays > 0 ? +((daysLogged / expectedDays) * 100).toFixed(1) : 0;
      const status = this.attendanceStatus(absences, tardiness, attendancePercent, daysLogged, expectedDays);

      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`,
        department: u.department?.name ?? null,
        daysLogged,
        expectedDays,
        absences,
        tardiness,
        attendancePercent,
        status,
      };
    });

    return { rows, from, to };
  }

  async reportAttendance(tenantId: string, user: AuthPrincipal, query: Record<string, string>) {
    this.requireAny(user, 'attendance:read_org', 'dashboard:read_org');

    const { rows, from, to } = await this.computeAttendanceRows(tenantId, user, query);

    const filtered = query.status ? rows.filter((r) => r.status === query.status) : rows;

    const sortableKeys = new Set(['name', 'attendancePercent', 'absences', 'tardiness', 'daysLogged']);
    const sortBy = sortableKeys.has(query.sortBy ?? '') ? (query.sortBy as string) : 'name';
    const sortDir = query.sortDir === 'desc' ? -1 : 1;
    filtered.sort((a: any, b: any) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return ((av ?? 0) - (bv ?? 0)) * sortDir;
    });

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    const avgAttendanceRate = rows.length > 0 ? +(rows.reduce((s, r) => s + r.attendancePercent, 0) / rows.length).toFixed(1) : 0;
    const totalTardiness = rows.reduce((s, r) => s + r.tardiness, 0);
    const unexcusedAbsences = rows.reduce((s, r) => s + r.absences, 0);
    const pendingReviews = rows.filter((r) => r.status === 'CRITICAL').length;

    return {
      data: paged,
      page: { page, pageSize, total, totalPages },
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: { avgAttendanceRate, totalTardiness, unexcusedAbsences, pendingReviews },
    };
  }

  async exportAttendanceReport(
    tenantId: string,
    user: AuthPrincipal,
    query: Record<string, string>,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.requireAny(user, 'attendance:read_org', 'dashboard:read_org');

    const { rows } = await this.computeAttendanceRows(tenantId, user, query);
    const filtered = query.status ? rows.filter((r) => r.status === query.status) : rows;
    const format = (query.format ?? 'CSV').toUpperCase();

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'attendance_report',
        metadata: { event: 'ATTENDANCE_REPORT_EXPORTED', format, count: filtered.length },
      },
    });

    if (format === 'XLSX') {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Attendance');
      sheet.columns = [
        { header: 'Employee', key: 'name', width: 25 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Days Logged', key: 'daysLogged', width: 14 },
        { header: 'Expected Days', key: 'expectedDays', width: 14 },
        { header: 'Absences', key: 'absences', width: 12 },
        { header: 'Tardiness', key: 'tardiness', width: 12 },
        { header: 'Attendance %', key: 'attendancePercent', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
      ];
      for (const r of filtered) sheet.addRow(r);
      const buf = await workbook.xlsx.writeBuffer();
      return { buffer: Buffer.from(buf as ArrayBuffer), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'attendance-report.xlsx' };
    }

    if (format === 'PDF') {
      const { default: PDFDocument } = await import('pdfkit');
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.fontSize(18).text('Attendance Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);
      for (const r of filtered) {
        doc.text(`${r.name} — ${r.department ?? 'Unassigned'} — ${r.daysLogged}/${r.expectedDays} days — ${r.absences} absences — ${r.tardiness} tardy — ${r.attendancePercent}% — ${r.status}`);
      }
      doc.end();
      const buffer = await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
      return { buffer, contentType: 'application/pdf', filename: 'attendance-report.pdf' };
    }

    // CSV (default)
    const lines = ['Employee,Department,Days Logged,Expected Days,Absences,Tardiness,Attendance %,Status'];
    for (const r of filtered) {
      lines.push(`${r.name},${r.department ?? ''},${r.daysLogged},${r.expectedDays},${r.absences},${r.tardiness},${r.attendancePercent}%,${r.status}`);
    }
    return { buffer: Buffer.from(lines.join('\n'), 'utf-8'), contentType: 'text/csv', filename: 'attendance-report.csv' };
  }
}
