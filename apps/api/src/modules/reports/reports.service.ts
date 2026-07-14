import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, ReportCategory, ReportStatus, AuditAction, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { CacheService } from '../../infra/cache.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { buildPage, decodeCursor } from '../../common/crud/crud.service';

export interface ReportsQuery {
  q?: string;
  category?: ReportCategory;
  userId?: string;
  departmentId?: string;
  teamId?: string;
  from?: string;
  to?: string;
  limit?: string;
  cursor?: string;
}

export type AttendanceStatus = 'PERFECT' | 'EXCELLENT' | 'GOOD' | 'CRITICAL';

export interface AttendanceReportQuery {
  search?: string;
  departmentId?: string;
  payrollPeriodId?: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  sortBy?: 'name' | 'attendancePercent' | 'absences' | 'tardiness' | 'daysLogged';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly deptScope: DepartmentScopeService,
    @InjectQueue('reports-export') private readonly exportQueue: Queue,
  ) {}

  // ─── RBAC Checks ──────────────────────────────────────────────────────────

  private requireFinanceOrAdmin(p: AuthPrincipal) {
    const isAllowed = p.permissions.includes('*') ||
                      p.roles.includes('ADMIN') ||
                      p.roles.includes('FINANCE') ||
                      p.permissions.includes('payroll:read');
    if (!isAllowed) {
      throw new ForbiddenException('Only Finance and Administrators can access finance reports.');
    }
  }

  private async validateScope(p: AuthPrincipal, query: ReportsQuery) {
    const isAdmin = p.permissions.includes('*') || p.roles.includes('ADMIN');
    const isHR = p.roles.includes('HR') || p.permissions.includes('org:read_dashboard');
    const isSupervisor = p.roles.includes('SUPERVISOR');

    if (p.roles.includes('EMPLOYEE') && !isAdmin && !isHR && !isSupervisor) {
      throw new ForbiddenException('Employees cannot access the Reports & Analytics module.');
    }

    if (isSupervisor && !isAdmin && !isHR) {
      const supervisorUser = await this.prisma.user.findFirst({ where: { id: p.userId } });
      // Supervisor restricted to their assigned department or team
      if (query.departmentId && query.departmentId !== supervisorUser?.departmentId) {
        throw new ForbiddenException('Supervisors can only generate reports for their assigned department.');
      }
      query.departmentId = supervisorUser?.departmentId || undefined;
    }
  }

  // ─── Dashboard Stats (GET /reports/dashboard) ─────────────────────────────

  async getDashboardData(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    // Cache dashboard statistics (BR-Report-11: Cache dashboard statistics)
    const cacheKey = `reports:dash:org:${p.organizationId}:d:${query.departmentId || 'all'}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    // 1. Attendance Rate
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
      },
    });
    const approved = timesheets.filter((t) => t.status === 'APPROVED' || t.status === 'PAYROLL_READY').length;
    const attendanceRate = timesheets.length > 0 ? Math.round((approved / timesheets.length) * 100) : 0;

    // 2. Labor Cost (Sum of payroll lines excluding interns)
    const payrollLines = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        user: {
          deletedAt: null,
          employmentType: { not: 'INTERN' }, // Exclude interns from payroll analytics
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      },
    });
    const laborCost = payrollLines.reduce((acc, line) => acc + Number(line.estimatedPay || 0), 0);

    // 3. Active Users
    const activeUsers = await this.prisma.user.count({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
    });

    // 4. Compliance Score (Simulate based on timesheet approvals vs rejections)
    const totalTimesheets = timesheets.length;
    const rejectedTimesheets = timesheets.filter((t) => t.status === 'REJECTED' || t.status === 'REVISION_REQUESTED').length;
    const complianceScore = totalTimesheets > 0 ? Math.round(((totalTimesheets - rejectedTimesheets) / totalTimesheets) * 100) : 0;

    // 5. Labor Distribution by Department
    const depts = await this.prisma.department.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId },
      include: {
        users: {
          where: { deletedAt: null },
          include: { payrollLineItems: true },
        },
      },
    });

    const laborDistribution = depts.map((d) => {
      let cost = 0;
      d.users.forEach((u) => {
        if (u.employmentType !== 'INTERN') {
          u.payrollLineItems.forEach((pl) => cost += Number(pl.estimatedPay || 0));
        }
      });
      return { name: d.name, cost };
    });

    // 6. Recent Admin & Security Audit logs
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { tenantId: p.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });

    const formattedLogs = await Promise.all(
      auditLogs.map(async (log) => {
        let email = 'System / Process';
        if (log.actorId) {
          const user = await this.prisma.user.findFirst({ where: { id: log.actorId } });
          if (user) email = user.email;
        }
        return {
          id: log.id,
          action: log.action,
          actor: email,
          timestamp: log.createdAt.toISOString(),
          status: 'SUCCESS',
        };
      })
    );

    const data = {
      attendanceRate,
      laborCost,
      activeUsers,
      complianceScore,
      laborDistribution,
      auditLogs: formattedLogs,
    };

    // Cache for 60 seconds
    await this.cache.set(cacheKey, data, 60);
    return data;
  }

  // ─── Analytics Helpers ────────────────────────────────────────────────────

  /** Real weekly attendance trend: share of timesheets per ISO week that reached
   *  APPROVED/PAYROLL_READY, over the last 4 calendar weeks. */
  async getAttendance(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const since = new Date();
    since.setDate(since.getDate() - 28);
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        periodStart: { gte: since },
        ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
      },
      select: { status: true, periodStart: true },
    });

    const buckets = new Map<string, { total: number; approved: number }>();
    for (const ts of timesheets) {
      const weekKey = toIsoWeekKey(ts.periodStart);
      const bucket = buckets.get(weekKey) ?? { total: 0, approved: 0 };
      bucket.total += 1;
      if (ts.status === 'APPROVED' || ts.status === 'PAYROLL_READY') bucket.approved += 1;
      buckets.set(weekKey, bucket);
    }

    const trends = Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([week, b]) => ({ week, rate: b.total > 0 ? Math.round((b.approved / b.total) * 100) : 0 }));

    const totalCount = timesheets.length;
    const approvedCount = timesheets.filter((t) => t.status === 'APPROVED' || t.status === 'PAYROLL_READY').length;
    const averagePunctuality = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

    return { averagePunctuality, trends };
  }

  // ─── Attendance Report (HR page) ──────────────────────────────────────────

  private countWorkingDays(from: Date, to: Date, holidays: Set<string>): number {
    let count = 0;
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    while (d <= end) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        const key = d.toISOString().split('T')[0];
        if (!holidays.has(key)) count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  private async resolveDateRange(
    p: AuthPrincipal,
    query: AttendanceReportQuery,
  ): Promise<{ from: Date; to: Date }> {
    if (query.payrollPeriodId) {
      const period = await this.prisma.payrollPeriod.findFirst({
        where: { id: query.payrollPeriodId, tenantId: p.tenantId, organizationId: p.organizationId },
      });
      if (period) return { from: period.startDate, to: period.endDate };
    }
    if (query.from && query.to) {
      return { from: new Date(query.from), to: new Date(query.to) };
    }
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  async getAttendanceReport(p: AuthPrincipal, query: AttendanceReportQuery = {}) {
    this.requireFinanceOrAdmin(p);

    const { from, to } = await this.resolveDateRange(p, query);

    const holidays = await this.prisma.holiday.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        date: { gte: from, lte: to },
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().split('T')[0]));
    const expectedDays = this.countWorkingDays(from, to, holidaySet);

    const userWhere: Prisma.UserWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      status: 'ACTIVE',
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };
    if (query.search) {
      userWhere.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where: userWhere });

    let users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
    });

    const userIds = users.map((u) => u.id);

    const [timeEntries, timesheets] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          tenantId: p.tenantId,
          userId: { in: userIds },
          deletedAt: null,
          startTime: { gte: from },
          endTime: { lte: to },
        },
        select: { userId: true, startTime: true, durationMinutes: true },
      }),
      this.prisma.timesheet.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: { in: userIds },
          deletedAt: null,
          periodStart: { lte: to },
          periodEnd: { gte: from },
        },
        select: { userId: true, status: true },
      }),
    ]);

    let rows = users.map((user) => {
      const userEntries = timeEntries.filter((te) => te.userId === user.id);
      const userTimesheets = timesheets.filter((ts) => ts.userId === user.id);

      const loggedDays = new Set(
        userEntries
          .filter((te) => te.startTime >= from && te.startTime <= to)
          .map((te) => te.startTime.toISOString().split('T')[0]),
      ).size;

      const tardiness = userEntries.filter((te) => {
        const h = te.startTime.getUTCHours();
        const m = te.startTime.getUTCMinutes();
        return h > 9 || (h === 9 && m > 0);
      }).length;

      const absences = Math.max(0, expectedDays - loggedDays);

      const attendancePercent = expectedDays > 0 ? Math.round((loggedDays / expectedDays) * 100) : 0;

      let status: AttendanceStatus = 'CRITICAL';
      if (attendancePercent >= 100) status = 'PERFECT';
      else if (attendancePercent >= 90) status = 'EXCELLENT';
      else if (attendancePercent >= 75) status = 'GOOD';

      const pendingReviews = userTimesheets.filter(
        (ts) => ts.status === 'SUBMITTED' || ts.status === 'UNDER_REVIEW' || ts.status === 'REVISION_REQUESTED',
      ).length;

      return {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        department: user.department?.name ?? null,
        daysLogged: loggedDays,
        expectedDays,
        absences,
        tardiness,
        attendancePercent,
        status,
        pendingReviews,
      };
    });

    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }

    const sortBy = query.sortBy ?? 'name';
    const sortDir = query.sortDir ?? 'asc';
    rows.sort((a, b) => {
      if (sortBy === 'name') {
        return sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      }
      return sortDir === 'desc'
        ? (b[sortBy] as number) - (a[sortBy] as number)
        : (a[sortBy] as number) - (b[sortBy] as number);
    });

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize);

    const summary = {
      avgAttendanceRate: rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + r.attendancePercent, 0) / rows.length)
        : 0,
      totalTardiness: rows.reduce((s, r) => s + r.tardiness, 0),
      unexcusedAbsences: rows.reduce((s, r) => s + r.absences, 0),
      pendingReviews: rows.reduce((s, r) => s + r.pendingReviews, 0),
    };

    const adjustedTotal = query.status ? rows.length : total;

    return {
      data: paginatedRows,
      page: { page, pageSize, total: adjustedTotal, totalPages },
      period: { from: from.toISOString(), to: to.toISOString() },
      summary,
    };
  }

  async exportAttendanceReport(p: AuthPrincipal, query: AttendanceReportQuery & { format: 'CSV' | 'XLSX' | 'PDF' }) {
    this.requireFinanceOrAdmin(p);

    const report = await this.getAttendanceReport(p, query);

    const header = 'Employee,Department,Days Logged,Expected Days,Absences,Tardiness,Attendance %,Status\n';
    const csvRows = report.data.map(
      (r) =>
        `"${r.name}","${r.department ?? ''}",${r.daysLogged},${r.expectedDays},${r.absences},${r.tardiness},${r.attendancePercent}%,"${r.status}"`,
    );
    const csv = header + csvRows.join('\n') + '\n';

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'attendance_export',
        metadata: { format: query.format, period: report.period },
      },
    });

    return { csv, filename: `attendance-report-${report.period.from.split('T')[0]}-to-${report.period.to.split('T')[0]}.csv` };
  }

  /** Real payroll totals from the most recently generated report (BR-PAY-05: interns already excluded at generation time). */
  async getPayrollStats(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const latestReport = await this.prisma.payrollReport.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: query.departmentId
          ? { where: { user: { departmentId: query.departmentId } } }
          : true,
      },
    });

    const lineItems = latestReport?.lineItems ?? [];
    const payrollTotal = lineItems.reduce((acc, li) => acc + Number(li.estimatedPay || 0), 0);

    return {
      payrollTotal,
      internsExcluded: true,
      eligibleCount: lineItems.length,
    };
  }

  /** Real timesheet status counts within the current scope. */
  async getTimesheetsStats(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
    };
    const byStatus = await this.prisma.timesheet.groupBy({ by: ['status'], where, _count: { id: true } });
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])) as Record<TimesheetStatus, number>;

    const approved = (counts.APPROVED ?? 0) + (counts.PAYROLL_READY ?? 0);
    const pending = (counts.SUBMITTED ?? 0) + (counts.UNDER_REVIEW ?? 0) + (counts.REVISION_REQUESTED ?? 0);
    const submitted = Object.values(counts).reduce((a, b) => a + b, 0) - (counts.DRAFT ?? 0);

    return { submitted, approved, pending };
  }

  /** Real labor cost for the current calendar month, from payroll line items whose report period overlaps it. */
  async getLaborCost(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        user: {
          employmentType: { not: 'INTERN' },
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
        payrollReport: {
          period: { startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
        },
      },
    });

    const monthlyLaborCost = lineItems.reduce((acc, li) => acc + Number(li.estimatedPay || 0), 0);
    return { monthlyLaborCost, currency: 'PHP' };
  }

  /** Real compliance signal derived from timesheet outcomes (rejection/revision rate). This app
   *  does not track formal GDPR/SOC2 certification status, so we don't fabricate those claims. */
  async getComplianceStats(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      status: { not: 'DRAFT' },
      ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
    };
    const total = await this.prisma.timesheet.count({ where });
    const flagged = await this.prisma.timesheet.count({
      where: { ...where, status: { in: ['REJECTED', 'REVISION_REQUESTED'] } },
    });
    const score = total > 0 ? Math.round(((total - flagged) / total) * 100 * 10) / 10 : 0;

    return { score, flaggedCount: flagged, totalCount: total };
  }

  /** Real department count + org-wide resource utilization (hours logged this week vs. standard capacity). */
  async getDepartmentsStats(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const departmentsCount = await this.prisma.department.count({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [activeEmployees, weekAgg] = await Promise.all([
      this.prisma.user.count({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          status: 'ACTIVE',
          deletedAt: null,
          ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        },
      }),
      this.prisma.timeEntry.aggregate({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          deletedAt: null,
          startTime: { gte: startOfWeek },
          ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
        },
        _sum: { durationMinutes: true },
      }),
    ]);

    const loggedHours = (weekAgg._sum.durationMinutes ?? 0) / 60;
    const capacityHours = activeEmployees * 40;
    const utilizationPercent = capacityHours > 0 ? Math.min(100, Math.round((loggedHours / capacityHours) * 100)) : 0;

    return { departmentsCount, utilizationPercent };
  }

  // ─── Report History (GET /reports/history) ────────────────────────────────

  async getHistory(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const limit = Math.min(Number(query.limit ?? 25), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Prisma.GeneratedReportWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
    };

    if (query.category) {
      where.category = query.category;
    }

    const rows = await this.prisma.generatedReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        creator: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    return buildPage(rows, limit);
  }

  // ─── POST /reports/generate ───────────────────────────────────────────────

  async triggerGeneration(p: AuthPrincipal, category: ReportCategory, format: 'PDF' | 'CSV' | 'XLSX', query: ReportsQuery) {
    await this.validateScope(p, query);

    // Save report placeholder history (PENDING)
    const report = await this.prisma.generatedReport.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        name: `${category.replace('_', ' ')} Report (${format})`,
        category,
        format,
        status: ReportStatus.PENDING,
        dateRange: query.from && query.to ? `${query.from} to ${query.to}` : 'All-time',
        createdBy: p.userId,
      },
    });

    // Audit report generation (BR-Report-09: Audit every report generation)
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'report_generation',
        entityId: report.id as any,
        metadata: { category, format, reportId: report.id },
      },
    });

    // Enqueue BullMQ heavy generation task
    await this.exportQueue.add('generate-report-job', {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      reportId: report.id,
      category,
      format,
      actorId: p.userId,
      query,
    }, { attempts: 2, backoff: { type: 'exponential', delay: 2000 } });

    return report;
  }

  // ─── POST /reports/export (Immediate Download Audit) ──────────────────────

  async auditDownload(p: AuthPrincipal, id: string) {
    await this.validateScope(p, {});
    const report = await this.prisma.generatedReport.findFirst({
      where: { id, tenantId: p.tenantId },
    });
    if (!report) throw new NotFoundException('Report not found');

    // Increment download count
    await this.prisma.generatedReport.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });

    // Audit download
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'report_download',
        entityId: report.id as any,
        metadata: { reportId: report.id, category: report.category },
      },
    });

    return report;
  }

  // ─── DELETE /reports/:id ──────────────────────────────────────────────────

  async deleteReport(p: AuthPrincipal, id: string) {
    // Only Administrators can delete generated reports
    if (!p.permissions.includes('*') && !p.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only Administrators can delete reports.');
    }

    const report = await this.prisma.generatedReport.findFirst({
      where: { id, tenantId: p.tenantId },
    });
    if (!report) throw new NotFoundException('Report not found');

    await this.prisma.generatedReport.delete({ where: { id } });

    // Audit report deletion
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'report_deletion',
        entityId: report.id as any,
        metadata: { reportId: report.id, category: report.category },
      },
    });

    return { success: true };
  }

  // ─── Team Productivity Reports (Supervisor / Admin) ──────────────────────────

  async getTeamProductivity(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);
    const limit = Math.min(Number(query.limit ?? 10), 50);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    // Resolve reports list or users — department-based supervision.
    const deptIds = await this.deptScope.managedDepartmentIds(p);
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        departmentId: { in: deptIds },
        ...(query.q
          ? {
              OR: [
                { firstName: { contains: query.q, mode: 'insensitive' } },
                { lastName: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, jobTitle: true, hourlyRate: true, department: { select: { name: true } } },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const userIds = reports.map((r) => r.id);

    // Fetch timesheet entries for users in the given range
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: { in: userIds },
        deletedAt: null,
        ...(query.from || query.to
          ? {
              periodStart: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
    });

    const userProductivity = reports.map((r) => {
      const userTimesheets = timesheets.filter((t) => t.userId === r.id);
      
      let approvedMins = 0;
      let pendingMins = 0;
      let rejectedMins = 0;

      userTimesheets.forEach((t) => {
        if (t.status === 'APPROVED' || t.status === 'PAYROLL_READY') {
          approvedMins += t.totalMinutes;
        } else if (t.status === 'SUBMITTED' || t.status === 'UNDER_REVIEW' || t.status === 'REVISION_REQUESTED') {
          pendingMins += t.totalMinutes;
        } else if (t.status === 'REJECTED') {
          rejectedMins += t.totalMinutes;
        }
      });

      const approvedHours = approvedMins / 60;
      const pendingHours = pendingMins / 60;
      const rejectedHours = rejectedMins / 60;
      const rate = Number(r.hourlyRate || 35); // fallback default hourly rate
      const payrollEstimate = approvedHours * rate;

      return {
        id: r.id,
        userId: r.id,
        name: `${r.firstName} ${r.lastName}`,
        department: r.department?.name || 'Unassigned',
        role: r.jobTitle || 'Employee',
        approvedHours: Math.round(approvedHours * 100) / 100,
        pendingHours: Math.round(pendingHours * 100) / 100,
        rejectedHours: Math.round(rejectedHours * 100) / 100,
        payrollEstimate: Math.round(payrollEstimate * 100) / 100,
      };
    });

    return buildPage(userProductivity, limit);
  }

  async getTeamProductivitySummary(p: AuthPrincipal, query: ReportsQuery) {
    await this.validateScope(p, query);

    const deptIds = await this.deptScope.managedDepartmentIds(p);
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        departmentId: { in: deptIds },
      },
      select: { id: true, hourlyRate: true },
    });
    const userIds = reports.map((r) => r.id);
    const rateMap = new Map(reports.map((r) => [r.id, Number(r.hourlyRate || 35)]));

    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: { in: userIds },
        deletedAt: null,
        ...(query.from || query.to
          ? {
              periodStart: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
    });

    let totalApprovedMins = 0;
    let totalPendingMins = 0;
    let totalPayrollLiability = 0;

    timesheets.forEach((t) => {
      const rate = rateMap.get(t.userId) ?? 35;
      if (t.status === 'APPROVED' || t.status === 'PAYROLL_READY') {
        totalApprovedMins += t.totalMinutes;
        totalPayrollLiability += (t.totalMinutes / 60) * rate;
      } else if (t.status === 'SUBMITTED' || t.status === 'UNDER_REVIEW' || t.status === 'REVISION_REQUESTED') {
        totalPendingMins += t.totalMinutes;
      }
    });

    return {
      totalApprovedHours: Math.round((totalApprovedMins / 60) * 100) / 100,
      totalPendingHours: Math.round((totalPendingMins / 60) * 100) / 100,
      payrollLiability: Math.round(totalPayrollLiability * 100) / 100,
      changePercent: '+4.2%',
    };
  }

  // ─── Finance Reports Dashboard (with previous period comparison) ─────────────

  async getFinanceDashboard(p: AuthPrincipal, query: ReportsQuery) {
    this.requireFinanceOrAdmin(p);

    const cacheKey = `reports:finance-dash:org:${p.organizationId}:d:${query.departmentId || 'all'}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const baseWhere = { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null };
    const deptFilter = query.departmentId ? { departmentId: query.departmentId } : {};

    // --- Attendance ---
    const [currentTimesheets, prevTimesheets] = await Promise.all([
      this.prisma.timesheet.findMany({
        where: {
          ...baseWhere,
          periodStart: { gte: monthStart },
          periodEnd: { lte: monthEnd },
          ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
        },
      }),
      this.prisma.timesheet.findMany({
        where: {
          ...baseWhere,
          periodStart: { gte: prevMonthStart },
          periodEnd: { lte: prevMonthEnd },
          ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
        },
      }),
    ]);

    const calcAttendance = (sheets: typeof currentTimesheets) => {
      if (sheets.length === 0) return 0;
      const approved = sheets.filter((s) => s.status === 'APPROVED' || s.status === 'PAYROLL_READY').length;
      return Math.round((approved / sheets.length) * 100);
    };
    const attendanceValue = calcAttendance(currentTimesheets);
    const prevAttendanceValue = calcAttendance(prevTimesheets);
    const attendanceChange = prevAttendanceValue > 0
      ? Number((((attendanceValue - prevAttendanceValue) / prevAttendanceValue) * 100).toFixed(1))
      : 0;

    // --- Labor Cost ---
    const [currentLabor, prevLabor] = await Promise.all([
      this.prisma.payrollLineItem.aggregate({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          user: { employmentType: { not: 'INTERN' }, deletedAt: null, ...deptFilter },
          payrollReport: {
            period: { startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
          },
        },
        _sum: { estimatedPay: true },
      }),
      this.prisma.payrollLineItem.aggregate({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          user: { employmentType: { not: 'INTERN' }, deletedAt: null, ...deptFilter },
          payrollReport: {
            period: { startDate: { lte: prevMonthEnd }, endDate: { gte: prevMonthStart } },
          },
        },
        _sum: { estimatedPay: true },
      }),
    ]);

    const laborValue = Number(currentLabor._sum.estimatedPay ?? 0);
    const prevLaborValue = Number(prevLabor._sum.estimatedPay ?? 0);
    const laborChange = prevLaborValue > 0
      ? Number((((laborValue - prevLaborValue) / prevLaborValue) * 100).toFixed(1))
      : 0;

    // --- Payroll ---
    const [currentPayroll, prevPayroll] = await Promise.all([
      this.prisma.payrollPeriod.aggregate({
        where: {
          ...baseWhere,
          status: { in: ['GENERATED', 'LOCKED', 'EXPORTED'] },
          startDate: { gte: monthStart },
          endDate: { lte: monthEnd },
        },
        _count: { id: true },
      }),
      this.prisma.payrollPeriod.aggregate({
        where: {
          ...baseWhere,
          status: { in: ['GENERATED', 'LOCKED', 'EXPORTED'] },
          startDate: { gte: prevMonthStart },
          endDate: { lte: prevMonthEnd },
        },
        _count: { id: true },
      }),
    ]);

    const payrollValue = currentPayroll._count.id;
    const prevPayrollValue = prevPayroll._count.id;
    const payrollChange = prevPayrollValue > 0
      ? Number((((payrollValue - prevPayrollValue) / prevPayrollValue) * 100).toFixed(1))
      : 0;

    // --- Compliance ---
    const [currentCompliance, prevCompliance] = await Promise.all([
      this.prisma.timesheet.findMany({
        where: {
          ...baseWhere,
          status: { not: 'DRAFT' },
          periodStart: { gte: monthStart },
          periodEnd: { lte: monthEnd },
          ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
        },
      }),
      this.prisma.timesheet.findMany({
        where: {
          ...baseWhere,
          status: { not: 'DRAFT' },
          periodStart: { gte: prevMonthStart },
          periodEnd: { lte: prevMonthEnd },
          ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
        },
      }),
    ]);

    const calcCompliance = (sheets: typeof currentCompliance) => {
      if (sheets.length === 0) return 100;
      const flagged = sheets.filter((s) => s.status === 'REJECTED' || s.status === 'REVISION_REQUESTED').length;
      return Math.round(((sheets.length - flagged) / sheets.length) * 100);
    };
    const complianceValue = calcCompliance(currentCompliance);
    const prevComplianceValue = calcCompliance(prevCompliance);
    const complianceChange = prevComplianceValue > 0
      ? Number((((complianceValue - prevComplianceValue) / prevComplianceValue) * 100).toFixed(1))
      : 0;

    const data = {
      attendance: { value: attendanceValue, previous: prevAttendanceValue, change: attendanceChange },
      laborCost: { value: laborValue, previous: prevLaborValue, change: laborChange },
      payroll: { value: payrollValue, previous: prevPayrollValue, change: payrollChange },
      compliance: { value: complianceValue, previous: prevComplianceValue, change: complianceChange },
    };

    await this.cache.set(cacheKey, data, 60);
    return data;
  }

  // ─── Payroll Report with filters (Finance) ───────────────────────────────────

  async getFinancePayrollReport(p: AuthPrincipal, query: ReportsQuery) {
    this.requireFinanceOrAdmin(p);

    const where: Prisma.PayrollPeriodWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
    };

    if (query.from || query.to) {
      where.startDate = { ...(query.from ? { gte: new Date(query.from) } : {}) };
      where.endDate = { ...(query.to ? { lte: new Date(query.to) } : {}) };
    }

    const periods = await this.prisma.payrollPeriod.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: Math.min(Number(query.limit ?? 20), 100),
      include: {
        reports: {
          include: {
            lineItems: {
              include: {
                user: {
                  select: {
                    id: true, firstName: true, lastName: true, email: true,
                    jobTitle: true, employmentType: true, hourlyRate: true,
                    department: { select: { name: true } },
                  },
                },
              },
              ...(query.userId ? { where: { userId: query.userId } } : {}),
              ...(query.departmentId ? { where: { user: { departmentId: query.departmentId } } } : {}),
            },
          },
        },
      },
    });

    const lineItems = periods.flatMap((p) => p.reports.flatMap((r) => r.lineItems));
    const totalGrossPayroll = lineItems.reduce((acc, li) => acc + Number(li.estimatedPay), 0);
    const totalEmployees = new Set(lineItems.map((li) => li.userId)).size;

    return {
      totalGrossPayroll,
      totalEmployees,
      periods: periods.map((p) => ({
        id: p.id,
        type: p.type,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
      })),
      lineItems: lineItems.map((li) => ({
        id: li.id,
        userId: li.userId,
        employee: `${li.user.firstName} ${li.user.lastName}`,
        department: li.user.department?.name ?? null,
        hourlyRate: Number(li.hourlyRate),
        approvedHours: Number(li.approvedHours),
        overtimeHours: Number(li.overtimeHours),
        estimatedPay: Number(li.estimatedPay),
        employmentType: li.user.employmentType,
      })),
    };
  }

  // ─── Overtime Analysis (Finance) ──────────────────────────────────────────────

  async getOvertimeAnalysis(p: AuthPrincipal, query: ReportsQuery) {
    this.requireFinanceOrAdmin(p);

    const { from, to } = query.from && query.to
      ? { from: new Date(query.from), to: new Date(query.to) }
      : (() => {
          const now = new Date();
          return {
            from: new Date(now.getFullYear(), now.getMonth(), 1),
            to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
          };
        })();

    const lineItems = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        overtimeHours: { gt: 0 },
        ...(query.departmentId ? { user: { departmentId: query.departmentId } } : {}),
        payrollReport: {
          period: { startDate: { lte: to }, endDate: { gte: from } },
        },
      },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const totalOvertimeHours = lineItems.reduce((acc, li) => acc + Number(li.overtimeHours), 0);
    const totalOvertimeCost = lineItems.reduce((acc, li) => {
      const rate = Number(li.hourlyRate);
      const otHours = Number(li.overtimeHours);
      return acc + otHours * rate * 1.25;
    }, 0);

    const deptMap = new Map<string, { hours: number; cost: number; employees: Set<string> }>();
    for (const li of lineItems) {
      const dept = li.user.department?.name ?? 'Unassigned';
      const entry = deptMap.get(dept) ?? { hours: 0, cost: 0, employees: new Set<string>() };
      entry.hours += Number(li.overtimeHours);
      entry.cost += Number(li.overtimeHours) * Number(li.hourlyRate) * 1.25;
      entry.employees.add(li.userId);
      deptMap.set(dept, entry);
    }

    return {
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
      totalOvertimeCost: Number(totalOvertimeCost.toFixed(2)),
      affectedEmployees: lineItems.length,
      byDepartment: Array.from(deptMap.entries()).map(([name, data]) => ({
        department: name,
        hours: Number(data.hours.toFixed(2)),
        cost: Number(data.cost.toFixed(2)),
        employeeCount: data.employees.size,
      })),
    };
  }
}

function toIsoWeekKey(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
