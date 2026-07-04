import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private hasAny(user: AuthPrincipal, ...perms: string[]): boolean {
    if (user.permissions.includes('*')) return true;
    return perms.some((p) => user.permissions.includes(p));
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
}
