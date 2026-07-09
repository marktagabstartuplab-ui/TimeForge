import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { CacheService } from '../../infra/cache.service';
import { FinanceService } from '../finance/finance.service';
import { PayrollService } from '../payroll/payroll.service';
import { ReportsService } from '../reports/reports.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildPage, decodeCursor } from '../../common/crud/crud.service';

export interface FinanceAiQuery {
  limit?: string;
  cursor?: string;
  severity?: string;
  departmentId?: string;
  status?: string;
  search?: string;
  period?: string;
  from?: string;
  to?: string;
}

export interface FinanceAiAlert {
  id: string;
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  department: string | null;
  recommendation: string;
  timestamp: string;
  status: 'OPEN' | 'REVIEWED' | 'RESOLVED';
  metadata: Record<string, unknown> | null;
}

export interface FinanceAiForecast {
  period: string;
  payrollForecast: { label: string; value: number }[];
  laborCostForecast: { label: string; value: number }[];
  budgetProjection: { label: string; value: number }[];
  cashFlowForecast: { label: string; value: number }[];
}

export interface DepartmentBudgetRow {
  departmentId: string;
  department: string;
  budget: number;
  spent: number;
  remaining: number;
  utilization: number;
  status: 'ON_TRACK' | 'AT_RISK' | 'OVER_BUDGET';
}

export interface LiabilityResponse {
  payrollLiability: number;
  outstandingPayroll: number;
  estimatedCost: number;
  financialExposure: number;
}

interface PayrollTrendPoint {
  label: string;
  totalPay: number;
  employeeCount: number;
}

@Injectable()
export class FinanceAiService {
  private readonly logger = new Logger(FinanceAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly financeSvc: FinanceService,
    private readonly payrollSvc: PayrollService,
    private readonly reportsSvc: ReportsService,
    private readonly notifications: NotificationsService,
    @InjectQueue('finance-ai') private readonly aiQueue: Queue,
  ) {}

  private requireFinanceOrAdmin(p: AuthPrincipal) {
    const isAllowed = p.permissions.includes('*') ||
                      p.roles.includes('ADMIN') ||
                      p.roles.includes('FINANCE') ||
                      p.permissions.includes('payroll:read');
    if (!isAllowed) {
      throw new NotFoundException('Only Finance and Administrators can access finance AI insights.');
    }
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(p: AuthPrincipal, query: FinanceAiQuery) {
    this.requireFinanceOrAdmin(p);

    const cacheKey = `finance-ai:dashboard:org:${p.organizationId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    // Use existing FinanceService and PayrollService for real data
    const [financeDash, payrollDash, reportsDash] = await Promise.all([
      this.financeSvc.getDashboard(p).catch(() => null) as Promise<{ totalPayroll: { value: number }; payrollCompletion: { value: number }; pendingPayroll: { value: number } } | null>,
      this.payrollSvc.getDashboard(p).catch(() => null),
      this.reportsSvc.getFinanceDashboard(p, query).catch(() => null),
    ]);

    // Payroll Liability: from payroll dashboard totalPayroll
    const payrollLiability = financeDash?.totalPayroll.value ?? payrollDash?.cards.totalPayroll.value ?? 0;
    const prevPayrollLiability = 0; // Will compute from historical data
    const payrollLiabilityChange = prevPayrollLiability > 0
      ? Number((((payrollLiability - prevPayrollLiability) / prevPayrollLiability) * 100).toFixed(1))
      : 0;

    // Budget Variance: compare latest payroll totals vs. estimated
    const latestReport = await this.prisma.payrollReport.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { totals: true },
    });
    const totalsObj = latestReport?.totals as { totalEstimatedPay?: string } | null;
    const totalEstimated = Number(totalsObj?.totalEstimatedPay ?? 0);
    const budgetAllocation = totalEstimated * 1.1; // Simulate 10% buffer as budget
    const budgetVariance = budgetAllocation > 0
      ? Number((((totalEstimated - budgetAllocation) / budgetAllocation) * 100).toFixed(1))
      : 0;

    // AI Efficiency Gain: from compliance and approval rates
    const efficiencyGain = reportsDash?.compliance?.value ?? payrollDash?.cards.payEfficiency.value ?? 0;
    const prevEfficiency = reportsDash?.compliance?.previous ?? 0;
    const efficiencyChange = prevEfficiency > 0
      ? Number((((efficiencyGain - prevEfficiency) / prevEfficiency) * 100).toFixed(1))
      : 0;

    // Payroll insights
    const [pendingApprovals, activeCycles, payrollHealth, complianceStatus] = await Promise.all([
      this.prisma.timesheet.count({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, deletedAt: null },
      }),
      this.prisma.payrollPeriod.count({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { in: ['OPEN', 'GENERATED', 'LOCKED'] } },
      }),
      (async () => {
        const all = await this.prisma.payrollPeriod.count({ where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null } });
        const completed = await this.prisma.payrollPeriod.count({ where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: 'EXPORTED' } });
        return all > 0 ? Math.round((completed / all) * 100) : 100;
      })(),
      (async () => {
        const total = await this.prisma.timesheet.count({ where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { not: 'DRAFT' } } });
        const flagged = await this.prisma.timesheet.count({ where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { in: ['REJECTED', 'REVISION_REQUESTED'] } } });
        return total > 0 ? Math.round(((total - flagged) / total) * 100) : 100;
      })(),
    ]);

    const data = {
      summaryCards: {
        payrollLiability: { value: payrollLiability, previous: prevPayrollLiability, change: payrollLiabilityChange },
        budgetVariance: { value: budgetVariance, previous: 0, change: 0 },
        aiEfficiencyGain: { value: efficiencyGain, previous: prevEfficiency, change: efficiencyChange },
      },
      payrollOversight: {
        pendingApprovals,
        activeCycles,
        aiValidationStatus: payrollDash?.cards.payEfficiency.value ?? 0,
        processingHealth: payrollHealth,
        complianceStatus,
      },
    };

    await this.cache.set(cacheKey, data, 60);
    return data;
  }

  // ─── Alerts ─────────────────────────────────────────────────────────────────

  async getAlerts(p: AuthPrincipal, query: FinanceAiQuery) {
    this.requireFinanceOrAdmin(p);

    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const alerts: FinanceAiAlert[] = [];

    // 1. Overtime Anomalies: Check line items with excessive overtime
    const overtimeItems = await this.prisma.payrollLineItem.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        overtimeHours: { gt: 20 },
      },
      take: 5,
      orderBy: { overtimeHours: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        payrollReport: { select: { createdAt: true } },
      },
    });

    for (const item of overtimeItems) {
      alerts.push({
        id: `ot-${item.id}`,
        type: 'OVERTIME_ANOMALY',
        severity: Number(item.overtimeHours) > 40 ? 'HIGH' : 'MEDIUM',
        title: 'Overtime Anomaly Detected',
        message: `${item.user.firstName} ${item.user.lastName} has ${Number(item.overtimeHours).toFixed(1)} hours of overtime`,
        department: item.user.department?.name ?? null,
        recommendation: 'Review workload distribution and consider additional staffing.',
        timestamp: item.payrollReport.createdAt.toISOString(),
        status: 'OPEN',
        metadata: { overtimeHours: Number(item.overtimeHours), userId: item.userId },
      });
    }

    // 2. Compliance Risks
    const totalTs = await this.prisma.timesheet.count({ where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { not: 'DRAFT' } } });
    const flaggedTs = await this.prisma.timesheet.count({ where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { in: ['REJECTED', 'REVISION_REQUESTED'] } } });
    const complianceScore = totalTs > 0 ? Math.round(((totalTs - flaggedTs) / totalTs) * 100) : 100;

    if (complianceScore < 80) {
      alerts.push({
        id: 'compliance-risk',
        type: 'COMPLIANCE_RISK',
        severity: complianceScore < 60 ? 'HIGH' : 'MEDIUM',
        title: 'Compliance Score Below Threshold',
        message: `Overall compliance score is ${complianceScore}%. Target is 80%.`,
        department: null,
        recommendation: 'Review rejected timesheets and address recurring compliance issues.',
        timestamp: new Date().toISOString(),
        status: 'OPEN',
        metadata: { complianceScore },
      });
    }

    // 3. Missing Financial Records: periods without generated reports
    const periodsWithoutReports = await this.prisma.payrollPeriod.count({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        status: 'OPEN',
        reports: { none: {} },
      },
    });

    if (periodsWithoutReports > 0) {
      alerts.push({
        id: 'missing-records',
        type: 'MISSING_RECORDS',
        severity: 'MEDIUM',
        title: 'Missing Financial Records',
        message: `${periodsWithoutReports} payroll period(s) have no generated reports.`,
        department: null,
        recommendation: 'Generate payroll reports for open periods to maintain accurate records.',
        timestamp: new Date().toISOString(),
        status: 'OPEN',
        metadata: { count: periodsWithoutReports },
      });
    }

    // 4. Payroll Errors: rejected timesheets
    const rejectedCount = await this.prisma.timesheet.count({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: 'REJECTED' },
    });

    if (rejectedCount > 0) {
      alerts.push({
        id: 'payroll-errors',
        type: 'PAYROLL_ERROR',
        severity: rejectedCount > 10 ? 'HIGH' : 'LOW',
        title: 'Payroll Errors Detected',
        message: `${rejectedCount} timesheet(s) have been rejected and need attention.`,
        department: null,
        recommendation: 'Review rejected timesheets and work with employees to resolve discrepancies.',
        timestamp: new Date().toISOString(),
        status: 'OPEN',
        metadata: { count: rejectedCount },
      });
    }

    // 5. Budget Threshold: compare spending vs budget
    const latestPayrollTotals = await this.prisma.payrollLineItem.aggregate({
      where: { tenantId: p.tenantId, organizationId: p.organizationId },
      _sum: { estimatedPay: true },
    });
    const totalSpend = Number(latestPayrollTotals._sum.estimatedPay ?? 0);
    const estimatedBudget = totalSpend * 1.15;

    if (totalSpend > estimatedBudget * 0.9) {
      alerts.push({
        id: 'budget-threshold',
        type: 'BUDGET_THRESHOLD',
        severity: totalSpend > estimatedBudget ? 'HIGH' : 'MEDIUM',
        title: 'Budget Threshold Exceeded',
        message: `Total payroll spend (${formatCurrency(totalSpend)}) has reached ${Math.round((totalSpend / estimatedBudget) * 100)}% of budget.`,
        department: null,
        recommendation: 'Review department budgets and identify cost-saving opportunities.',
        timestamp: new Date().toISOString(),
        status: 'OPEN',
        metadata: { totalSpend, budget: estimatedBudget },
      });
    }

    // 6. Duplicate Payroll Entries
    const dupCheck = await this.prisma.payrollLineItem.groupBy({
      by: ['userId', 'payrollReportId'],
      where: { tenantId: p.tenantId, organizationId: p.organizationId },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    });

    if (dupCheck.length > 0) {
      alerts.push({
        id: 'duplicate-entries',
        type: 'DUPLICATE_ENTRY',
        severity: 'HIGH',
        title: 'Duplicate Payroll Entries',
        message: `${dupCheck.length} employee(s) have duplicate payroll entries in the same report.`,
        department: null,
        recommendation: 'Review duplicate entries and remove erroneous records.',
        timestamp: new Date().toISOString(),
        status: 'OPEN',
        metadata: { count: dupCheck.length },
      });
    }

    // 7. Salary Variance Detection
    const deptRates = await this.prisma.user.groupBy({
      by: ['departmentId'],
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: 'ACTIVE', hourlyRate: { not: null } },
      _avg: { hourlyRate: true },
      _count: { id: true },
    });

    for (const dept of deptRates) {
      if (dept._count.id >= 5) {
        const deptName = await this.prisma.department.findFirst({ where: { id: dept.departmentId! }, select: { name: true } });
        alerts.push({
          id: `salary-variance-${dept.departmentId}`,
          type: 'SALARY_VARIANCE',
          severity: 'LOW',
          title: 'Salary Variance Detected',
          message: `${deptName?.name ?? 'Unknown'} department avg rate: ${formatCurrency(Number(dept._avg.hourlyRate ?? 0))}/hr`,
          department: deptName?.name ?? null,
          recommendation: 'Review compensation parity across departments.',
          timestamp: new Date().toISOString(),
          status: 'OPEN',
          metadata: { departmentId: dept.departmentId, avgRate: Number(dept._avg.hourlyRate) },
        });
      }
    }

    // Filter by severity, department, status, search
    let filtered = alerts;
    if (query.severity) filtered = filtered.filter((a) => a.severity === query.severity);
    if (query.departmentId) filtered = filtered.filter((a) => a.department === query.departmentId);
    if (query.status) filtered = filtered.filter((a) => a.status === query.status);
    if (query.search) {
      const s = query.search.toLowerCase();
      filtered = filtered.filter((a) => a.title.toLowerCase().includes(s) || a.message.toLowerCase().includes(s));
    }

    const sliced = cursor
      ? filtered.filter((a) => a.id > cursor)
      : filtered;
    const page = sliced.slice(0, limit);
    const nextCursor = page.length === limit ? page[page.length - 1].id : null;

    return { data: page, page: { nextCursor } };
  }

  // ─── Forecast ───────────────────────────────────────────────────────────────

  async getForecast(p: AuthPrincipal, query: FinanceAiQuery) {
    this.requireFinanceOrAdmin(p);

    const period = query.period ?? 'monthly';
    const now = new Date();
    const points: PayrollTrendPoint[] = [];

    if (period === 'monthly') {
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const agg = await this.prisma.payrollLineItem.aggregate({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReport: { period: { startDate: { gte: m }, endDate: { lte: mEnd } } },
          },
          _sum: { estimatedPay: true },
        });
        const empCount = await this.prisma.payrollLineItem.findMany({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReport: { period: { startDate: { gte: m }, endDate: { lte: mEnd } } },
          },
          select: { userId: true },
          distinct: ['userId'],
        });
        points.push({
          label: m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          totalPay: Number(agg._sum.estimatedPay ?? 0),
          employeeCount: empCount.length,
        });
      }
    } else if (period === 'quarterly') {
      for (let i = 3; i >= 0; i--) {
        const qStart = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
        const qEnd = new Date(now.getFullYear(), now.getMonth() - i * 3 + 3, 0);
        const agg = await this.prisma.payrollLineItem.aggregate({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReport: { period: { startDate: { gte: qStart }, endDate: { lte: qEnd } } },
          },
          _sum: { estimatedPay: true },
        });
        const empCount = await this.prisma.payrollLineItem.findMany({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReport: { period: { startDate: { gte: qStart }, endDate: { lte: qEnd } } },
          },
          select: { userId: true },
          distinct: ['userId'],
        });
        const qNum = Math.floor(qStart.getMonth() / 3) + 1;
        points.push({
          label: `Q${qNum} ${qStart.getFullYear()}`,
          totalPay: Number(agg._sum.estimatedPay ?? 0),
          employeeCount: empCount.length,
        });
      }
    } else if (period === 'yearly') {
      for (let i = 2; i >= 0; i--) {
        const yStart = new Date(now.getFullYear() - i, 0, 1);
        const yEnd = new Date(now.getFullYear() - i, 11, 31);
        const agg = await this.prisma.payrollLineItem.aggregate({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReport: { period: { startDate: { gte: yStart }, endDate: { lte: yEnd } } },
          },
          _sum: { estimatedPay: true },
        });
        const empCount = await this.prisma.payrollLineItem.findMany({
          where: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            payrollReport: { period: { startDate: { gte: yStart }, endDate: { lte: yEnd } } },
          },
          select: { userId: true },
          distinct: ['userId'],
        });
        points.push({
          label: `${yStart.getFullYear()}`,
          totalPay: Number(agg._sum.estimatedPay ?? 0),
          employeeCount: empCount.length,
        });
      }
    }

    // Build forecast: use simple linear projection from historical data
    const forecast = points.length >= 2 ? this.projectForecast(points, period) : points;

    const result: FinanceAiForecast = {
      period,
      payrollForecast: forecast.map((p) => ({ label: p.label, value: p.totalPay })),
      laborCostForecast: forecast.map((p) => ({ label: p.label, value: Math.round(p.totalPay * 0.75) })),
      budgetProjection: forecast.map((p) => ({ label: p.label, value: Math.round(p.totalPay * 1.1) })),
      cashFlowForecast: forecast.map((p) => ({ label: p.label, value: Math.round(p.totalPay * 1.05) })),
    };

    return result;
  }

  private projectForecast(historical: PayrollTrendPoint[], period: string): PayrollTrendPoint[] {
    if (historical.length < 2) return historical;

    const values = historical.map((p) => p.totalPay);
    const avgChange = values.slice(1).reduce((sum, v, i) => sum + (v - values[i]), 0) / (values.length - 1);
    const lastEmpCount = historical[historical.length - 1].employeeCount;

    const result = [...historical];
    const lastLabel = historical[historical.length - 1].label;
    const lastVal = values[values.length - 1];

    for (let i = 1; i <= 3; i++) {
      let nextLabel: string;
      if (period === 'monthly') {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        nextLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      } else if (period === 'quarterly') {
        const d = new Date();
        d.setMonth(d.getMonth() + i * 3);
        const qNum = Math.floor(d.getMonth() / 3) + 1;
        nextLabel = `Q${qNum} ${d.getFullYear()}`;
      } else {
        nextLabel = `${new Date().getFullYear() + i}`;
      }
      const projected = Math.max(0, lastVal + avgChange * i);
      result.push({ label: nextLabel, totalPay: Math.round(projected), employeeCount: lastEmpCount });
    }

    return result;
  }

  // ─── Budget Allocation ─────────────────────────────────────────────────────

  async getBudget(p: AuthPrincipal, query: FinanceAiQuery) {
    this.requireFinanceOrAdmin(p);

    const depts = await this.prisma.department.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });

    // Get latest spending per department
    const latestReport = await this.prisma.payrollReport.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: {
          include: { user: { select: { departmentId: true } } },
        },
      },
    });

    const deptSpending = new Map<string, number>();
    if (latestReport) {
      for (const li of latestReport.lineItems) {
        const deptId = li.user.departmentId ?? 'unassigned';
        deptSpending.set(deptId, (deptSpending.get(deptId) ?? 0) + Number(li.estimatedPay));
      }
    }

    let rows: DepartmentBudgetRow[] = depts.map((d) => {
      const spent = deptSpending.get(d.id) ?? 0;
      const budget = Math.round(spent * 1.2); // Budget is 120% of current spend
      const remaining = Math.max(0, budget - spent);
      const utilization = budget > 0 ? Math.round((spent / budget) * 100) : 0;
      const status: DepartmentBudgetRow['status'] = utilization > 95 ? 'OVER_BUDGET' : utilization > 80 ? 'AT_RISK' : 'ON_TRACK';
      return {
        departmentId: d.id,
        department: d.name,
        budget,
        spent,
        remaining,
        utilization,
        status,
      };
    });

    // Add unassigned
    const unassignedSpent = deptSpending.get('unassigned') ?? 0;
    if (unassignedSpent > 0) {
      rows.push({
        departmentId: 'unassigned',
        department: 'Unassigned',
        budget: Math.round(unassignedSpent * 1.2),
        spent: unassignedSpent,
        remaining: Math.round(unassignedSpent * 0.2),
        utilization: 100,
        status: 'AT_RISK',
      });
    }

    // Search / sort
    if (query.search) {
      const s = query.search.toLowerCase();
      rows = rows.filter((r) => r.department.toLowerCase().includes(s));
    }

    rows.sort((a, b) => b.spent - a.spent);

    const limit = Math.min(Number(query.limit ?? 20), 100);
    const total = rows.length;
    const sliced = rows.slice(0, limit);
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

    return {
      data: sliced,
      totals: { totalBudget, totalSpent, totalRemaining: totalBudget - totalSpent },
      total,
    };
  }

  // ─── Liability ──────────────────────────────────────────────────────────────

  async getLiability(p: AuthPrincipal) {
    this.requireFinanceOrAdmin(p);

    const [payrollAgg, pendingAgg, activeEmployees] = await Promise.all([
      this.prisma.payrollLineItem.aggregate({
        where: { tenantId: p.tenantId, organizationId: p.organizationId },
        _sum: { estimatedPay: true },
      }),
      this.prisma.timesheet.aggregate({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        _sum: { totalMinutes: true },
      }),
      this.prisma.user.count({
        where: { tenantId: p.tenantId, organizationId: p.organizationId, status: 'ACTIVE', payrollEligible: true, deletedAt: null, employmentType: { not: 'INTERN' } },
      }),
    ]);

    const historicalPayroll = Number(payrollAgg._sum.estimatedPay ?? 0);
    const avgRate = await this.prisma.user.aggregate({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, status: 'ACTIVE', deletedAt: null, hourlyRate: { not: null } },
      _avg: { hourlyRate: true },
    });
    const avgHourlyRate = Number(avgRate._avg.hourlyRate ?? 25);
    const pendingMinutes = Number(pendingAgg._sum.totalMinutes ?? 0);
    const pendingPayrollValue = (pendingMinutes / 60) * avgHourlyRate;

    return {
      payrollLiability: historicalPayroll,
      outstandingPayroll: Math.round(pendingPayrollValue),
      estimatedCost: Math.round(historicalPayroll * 1.15),
      financialExposure: Math.round(historicalPayroll + pendingPayrollValue),
    } satisfies LiabilityResponse;
  }

  // ─── Report Generation ──────────────────────────────────────────────────────

  async getReport(p: AuthPrincipal, id: string) {
    this.requireFinanceOrAdmin(p);

    const job = await this.prisma.aiJob.findFirst({
      where: { id, tenantId: p.tenantId, deletedAt: null },
      include: { result: true },
    });

    if (!job) throw new NotFoundException('Report not found');

    return {
      id: job.id,
      status: job.status,
      feature: job.feature,
      createdAt: job.createdAt.toISOString(),
      latencyMs: job.latencyMs,
      errorMsg: job.errorMsg,
      result: job.result
        ? {
            summary: job.result.summary,
            recommendation: job.result.recommendation,
            confidence: Number(job.result.confidence ?? 0),
          }
        : null,
    };
  }

  async report(p: AuthPrincipal, type?: string) {
    this.requireFinanceOrAdmin(p);

    // Get real data for the report
    const [financeDash, payrollDash, alerts] = await Promise.all([
      this.financeSvc.getDashboard(p).catch(() => null) as Promise<{ totalPayroll: { value: number }; payrollCompletion: { value: number }; pendingPayroll: { value: number } } | null>,
      this.payrollSvc.getDashboard(p).catch(() => null),
      this.getAlerts(p, {}),
    ]);

    // Compute summary
    const totalPayroll = financeDash?.totalPayroll.value ?? 0;
    const alertCount = alerts.data.length;
    const criticalAlerts = alerts.data.filter((a) => a.severity === 'HIGH').length;

    const reportData = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalPayroll,
        activeRuns: payrollDash?.cards.activePayruns.value ?? 0,
        pendingApprovals: payrollDash?.cards.pendingHRApprovals.value ?? 0,
        efficiency: payrollDash?.cards.payEfficiency.value ?? 0,
      },
      alerts: alerts.data.slice(0, 10),
      alertSummary: { total: alertCount, critical: criticalAlerts },
    };

    const jobId = randomUUID();

    // Create AiJob record immediately so polling endpoints can find it
    await this.prisma.aiJob.create({
      data: {
        id: jobId,
        tenantId: p.tenantId,
        feature: 'FINANCE_REPORT' as any,
        status: 'QUEUED',
        subjectId: p.organizationId,
        subjectType: 'organization',
        createdBy: p.userId,
      },
    });

    await this.aiQueue.add('generate-report', {
      jobId,
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      actorId: p.userId,
      type: type ?? 'GENERAL',
      reportData,
    }, { jobId, attempts: 2, backoff: { type: 'exponential', delay: 2000 } });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'finance_ai_report',
        entityId: jobId,
        metadata: { alertCount, criticalAlerts },
      },
    });

    // Notify finance users
    const financeUsers = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        roles: { some: { role: { key: 'FINANCE' } } },
        deletedAt: null,
      },
      select: { id: true },
    });

    await Promise.all(
      financeUsers.map((u) =>
        this.notifications.create({
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: u.id,
          type: 'ANNOUNCEMENT' as any,
          category: 'REPORT' as any,
          title: 'AI Financial Report Ready',
          message: `AI analysis complete: ${alertCount} alerts found (${criticalAlerts} critical).`,
          actionUrl: '/finance/ai-insights',
          actionLabel: 'View Report',
        }),
      ),
    ).catch((err) => this.logger.error('Notification fan-out failed:', err));

    return { jobId, type: type ?? 'GENERAL', message: 'AI report generation queued. You will be notified when ready.' };
  }

  // ─── Review Alert ───────────────────────────────────────────────────────────

  async reviewAlert(p: AuthPrincipal, id: string) {
    this.requireFinanceOrAdmin(p);

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'finance_ai_alert_review',
        entityId: id,
        metadata: { reviewedAt: new Date().toISOString() },
      },
    });

    return { success: true, message: `Alert ${id} reviewed.` };
  }
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return `₱${value.toFixed(2)}`;
}
