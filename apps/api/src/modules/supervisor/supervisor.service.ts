import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { PERMISSIONS } from '@timeforge/shared';
import { ApprovalsService } from '../approvals/approvals.service';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { BulkApproveTimesheetsDto } from '../timesheets/dto';
import {
  SupervisorDailyScrumsQuery,
  SupervisorPendingTimesheetsQuery,
  SupervisorProductivityQuery,
  SupervisorTeamKpisQuery,
} from './dto';

/**
 * Thin orchestration layer over ApprovalsService / TimesheetsService / KpiProgress /
 * ScrumEntry / PayrollLineItem — reuses their existing team-scoping and business
 * rules rather than reimplementing them (see docs/Backend-RC-Review.md reuse policy).
 */
@Injectable()
export class SupervisorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly timesheets: TimesheetsService,
    private readonly deptScope: DepartmentScopeService,
  ) {}

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private assertSupervisorAccess(p: AuthPrincipal): void {
    if (
      !this.can(p, PERMISSIONS.TIMESHEET_READ_TEAM) &&
      !this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)
    ) {
      throw new ForbiddenException('Supervisor access required');
    }
  }

  /** Department members (+ self) for a supervisor (Department.managerId). */
  private teamUserIds(p: AuthPrincipal): Promise<string[]> {
    return this.deptScope.teamUserIds(p);
  }

  private async scopeUserIds(p: AuthPrincipal, orgPermission: string): Promise<string[] | undefined> {
    return this.can(p, orgPermission) ? undefined : await this.teamUserIds(p);
  }

  // ── GET /supervisor/dashboard ────────────────────────────────────────────────

  async dashboard(p: AuthPrincipal) {
    this.assertSupervisorAccess(p);
    const userIds = await this.scopeUserIds(p, PERMISSIONS.TIMESHEET_READ_ORG);

    const [pendingCount, pending, scrums, kpis, productivity] = await Promise.all([
      this.prisma.timesheet.count({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          deletedAt: null,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
          ...(userIds ? { userId: { in: userIds } } : {}),
        },
      }),
      this.pendingTimesheets(p, { limit: '5' }),
      this.dailyScrums(p, { limit: '3' }),
      this.teamKpis(p, {}),
      this.productivitySummary(p, {}),
    ]);

    return {
      pendingTimesheets: { count: pendingCount, items: pending.data },
      dailyScrums: { items: scrums },
      teamKpis: { items: kpis, belowTargetCount: kpis.filter((k) => k.belowTarget).length },
      productivity,
    };
  }

  // ── GET /supervisor/pending-timesheets ───────────────────────────────────────

  async pendingTimesheets(p: AuthPrincipal, query: SupervisorPendingTimesheetsQuery) {
    this.assertSupervisorAccess(p);
    const page = await this.approvals.findQueue(p, {
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
    });

    const userIds = [...new Set(page.data.map((t) => t.userId))];
    if (userIds.length === 0) return { data: [], page: page.page };

    const [users, progress] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } },
      }),
      this.prisma.kpiProgress.findMany({
        where: { tenantId: p.tenantId, userId: { in: userIds }, deletedAt: null },
        select: { userId: true, currentValue: true, targetValue: true },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const kpiScoresByUser = new Map<string, number[]>();
    for (const row of progress) {
      const target = Number(row.targetValue);
      const pct = target > 0 ? Math.min(100, (Number(row.currentValue) / target) * 100) : 0;
      if (!kpiScoresByUser.has(row.userId)) kpiScoresByUser.set(row.userId, []);
      kpiScoresByUser.get(row.userId)!.push(pct);
    }

    const data = page.data.map((t) => {
      const user = userMap.get(t.userId);
      const scores = kpiScoresByUser.get(t.userId) ?? [];
      const kpiScore = scores.length
        ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length)
        : null;
      return {
        id: t.id,
        userId: t.userId,
        employeeName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        department: user?.department?.name ?? null,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        totalHours: +(t.totalMinutes / 60).toFixed(2),
        kpiScore,
        status: t.status,
        version: t.version,
      };
    });

    return { data, page: page.page };
  }

  // ── GET /supervisor/daily-scrums ─────────────────────────────────────────────

  /** Latest scrum entry per team member — comment via the existing POST /scrum-entries/:id/comment. */
  async dailyScrums(p: AuthPrincipal, query: SupervisorDailyScrumsQuery) {
    if (!this.can(p, PERMISSIONS.SCRUM_READ_TEAM) && !this.can(p, PERMISSIONS.SCRUM_READ_ORG)) {
      throw new ForbiddenException('Supervisor access required');
    }
    const userIds = await this.scopeUserIds(p, PERMISSIONS.SCRUM_READ_ORG);
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const entries = await this.prisma.scrumEntry.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
      distinct: ['userId'],
      orderBy: [{ userId: 'asc' }, { entryDate: 'desc' }],
      include: { user: { select: { firstName: true, lastName: true } } },
      take: limit,
    });

    return entries
      .sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())
      .map((e) => ({
        id: e.id,
        userId: e.userId,
        employeeName: `${e.user.firstName} ${e.user.lastName}`,
        entryDate: e.entryDate,
        submittedAt: e.submittedAt,
        yesterday: e.yesterday,
        today: e.today,
        blockers: e.blockers,
        status: e.status,
        supervisorNote: e.supervisorNote,
        version: e.version,
      }));
  }

  // ── GET /supervisor/team-kpis ─────────────────────────────────────────────────

  /** Per-KPI-template team average, aggregated from real KpiProgress rows. */
  async teamKpis(p: AuthPrincipal, query: SupervisorTeamKpisQuery) {
    if (!this.can(p, PERMISSIONS.KPI_PROGRESS_READ_TEAM) && !this.can(p, PERMISSIONS.KPI_PROGRESS_READ_ORG)) {
      throw new ForbiddenException('Supervisor access required');
    }
    const userIds = await this.scopeUserIds(p, PERMISSIONS.KPI_PROGRESS_READ_ORG);

    const rows = await this.prisma.kpiProgress.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(userIds ? { userId: { in: userIds } } : {}),
        ...(query.kpiTemplateId ? { kpiTemplateId: query.kpiTemplateId } : {}),
      },
      include: { kpiTemplate: { select: { id: true, name: true } } },
    });

    const byTemplate = new Map<string, { name: string; currentSum: number; targetSum: number; sampleSize: number }>();
    for (const row of rows) {
      const key = row.kpiTemplateId;
      if (!byTemplate.has(key)) {
        byTemplate.set(key, { name: row.kpiTemplate.name, currentSum: 0, targetSum: 0, sampleSize: 0 });
      }
      const entry = byTemplate.get(key)!;
      entry.currentSum += Number(row.currentValue);
      entry.targetSum += Number(row.targetValue);
      entry.sampleSize += 1;
    }

    return Array.from(byTemplate.entries()).map(([kpiTemplateId, v]) => {
      const percentage = v.targetSum > 0 ? Math.round((v.currentSum / v.targetSum) * 100) : 0;
      return {
        kpiTemplateId,
        name: v.name,
        percentage: Math.min(percentage, 100),
        belowTarget: percentage < 100,
        sampleSize: v.sampleSize,
      };
    });
  }

  // ── GET /supervisor/productivity-summary ─────────────────────────────────────

  /**
   * Total hours / attendance / payroll status are visible to supervisors
   * (timesheet:read_team, payroll:read_status_team). Overtime cost (a dollar
   * amount) requires payroll:read — Finance/Admin only per the permission
   * matrix — so it's returned as `null` for callers without that permission;
   * overtimeHours is always real and safe to show.
   */
  async productivitySummary(p: AuthPrincipal, query: SupervisorProductivityQuery) {
    this.assertSupervisorAccess(p);
    const userIds = await this.scopeUserIds(p, PERMISSIONS.TIMESHEET_READ_ORG);

    const stats = await this.timesheets.stats(p, { from: query.from, to: query.to });

    const approvedWhere: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      status: { in: ['APPROVED', 'PAYROLL_READY'] as TimesheetStatus[] },
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(query.from || query.to
        ? {
            periodStart: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [approvedSheets, payrollReadyCount] = await Promise.all([
      this.prisma.timesheet.findMany({ where: approvedWhere, select: { totalMinutes: true } }),
      this.prisma.timesheet.count({ where: { ...approvedWhere, status: 'PAYROLL_READY' } }),
    ]);
    const totalHours = +(approvedSheets.reduce((sum, t) => sum + t.totalMinutes, 0) / 60).toFixed(1);
    const payrollStatus =
      approvedSheets.length > 0 ? `${payrollReadyCount}/${approvedSheets.length} Payroll-Ready` : 'No approved timesheets';

    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        ...(userIds ? { userId: { in: userIds } } : {}),
        overtimeHours: { gt: 0 },
      },
      select: { overtimeHours: true, hourlyRate: true },
    });
    const overtimeHours = +lineItems.reduce((sum, l) => sum + Number(l.overtimeHours), 0).toFixed(1);
    const overtimeCost = this.can(p, PERMISSIONS.PAYROLL_READ)
      ? +lineItems.reduce((sum, l) => sum + Number(l.overtimeHours) * Number(l.hourlyRate), 0).toFixed(2)
      : null;

    return {
      totalHours,
      attendanceRate: stats.completionRate,
      payrollStatus,
      overtimeHours,
      overtimeCost,
    };
  }

  // ── POST /supervisor/bulk-approve ────────────────────────────────────────────

  /** Delegates verbatim to TimesheetsService.bulkApprove — the sole bulk-decision path. */
  async bulkApprove(p: AuthPrincipal, dto: BulkApproveTimesheetsDto) {
    return this.timesheets.bulkApprove(p, dto);
  }
}
