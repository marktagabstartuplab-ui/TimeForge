import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditAction } from '@prisma/client';
import { PERMISSIONS } from '@timeforge/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../infra/cache.service';
import { AuthPrincipal } from '../../common/decorators';
import { ExportDashboardDto, FinanceTrendPeriod } from './dto';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectQueue('finance-analytics') private readonly analyticsQueue: Queue,
  ) {}

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  async getDashboard(p: AuthPrincipal) {
    if (!this.can(p, PERMISSIONS.PAYROLL_READ)) {
      throw new ForbiddenException('Only Finance/Admin can view the finance dashboard');
    }

    const cacheKey = `finance:dashboard`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const where = { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null };

    const [periods, readyEmployees, pendingCount, auditCount, userCount] = await Promise.all([
      this.prisma.payrollPeriod.findMany({
        where,
        orderBy: { startDate: 'desc' },
        include: {
          reports: {
            include: {
              lineItems: true,
            },
          },
        },
      }),
      this.prisma.user.count({
        where: { ...where, payrollEligible: true, status: 'ACTIVE', employmentType: { not: 'INTERN' } },
      }),
      this.prisma.payrollPeriod.count({
        where: { ...where, status: { in: ['OPEN', 'GENERATED'] } },
      }),
      this.prisma.auditLog.count({
        where: { tenantId: p.tenantId, action: 'PAYROLL_EXPORT' },
      }),
      this.prisma.user.count({
        where: { ...where, status: 'ACTIVE', deletedAt: null },
      }),
    ]);

    const reportsWithItems = periods.flatMap((per) => per.reports).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let totalPayroll = 0;
    let prevTotalPayroll = 0;
    if (reportsWithItems.length > 0) {
      const latest = reportsWithItems[0].totals as { totalEstimatedPay?: string } | null;
      totalPayroll = Number(latest?.totalEstimatedPay ?? 0);
      if (reportsWithItems.length > 1) {
        const prev = reportsWithItems[1].totals as { totalEstimatedPay?: string } | null;
        prevTotalPayroll = Number(prev?.totalEstimatedPay ?? 0);
      }
    }

    const totalPayrollTrend = prevTotalPayroll > 0 ? ((totalPayroll - prevTotalPayroll) / prevTotalPayroll) * 100 : 0;

    let totalEstimatedCost = 0;
    if (reportsWithItems.length > 0) {
      const latest = reportsWithItems[0].totals as { totalEstimatedPay?: string } | null;
      totalEstimatedCost = Number(latest?.totalEstimatedPay ?? 0);
    }

    const completedPeriods = periods.filter((per) => per.status === 'EXPORTED').length;
    const totalPeriods = periods.length || 1;
    const payrollCompletion = Math.round((completedPeriods / totalPeriods) * 100);

    const result = {
      totalPayroll: { value: totalPayroll, trend: Number(totalPayrollTrend.toFixed(1)) },
      employeesReady: { value: readyEmployees, total: userCount },
      pendingPayroll: { value: pendingCount },
      payrollCompletion: { value: payrollCompletion, completed: completedPeriods, total: totalPeriods },
      estimatedCost: { value: totalEstimatedCost },
      exportsCount: { value: auditCount },
    };

    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async getPayrollTrends(p: AuthPrincipal, period: FinanceTrendPeriod = FinanceTrendPeriod.MONTHLY) {
    if (!this.can(p, PERMISSIONS.PAYROLL_READ)) {
      throw new ForbiddenException('Only Finance/Admin can view payroll trends');
    }

    const cacheKey = `finance:trends:${period}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const periods = await this.prisma.payrollPeriod.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null, status: { in: ['GENERATED', 'LOCKED', 'EXPORTED'] } },
      orderBy: { startDate: 'asc' },
      include: {
        reports: {
          include: { lineItems: true },
        },
      },
    });

    const grouped = new Map<string, { totalPay: number; employeeCount: Set<string>; periodCount: number }>();

    for (const per of periods) {
      let groupKey: string;
      const d = new Date(per.startDate);
      switch (period) {
        case FinanceTrendPeriod.QUARTERLY:
          groupKey = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
          break;
        case FinanceTrendPeriod.YEARLY:
          groupKey = `${d.getFullYear()}`;
          break;
        default:
          groupKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, { totalPay: 0, employeeCount: new Set(), periodCount: 0 });
      }
      const entry = grouped.get(groupKey)!;
      entry.periodCount++;

      for (const report of per.reports) {
        const totals = report.totals as { totalEstimatedPay?: string } | null;
        entry.totalPay += Number(totals?.totalEstimatedPay ?? 0);
        for (const item of report.lineItems) {
          entry.employeeCount.add(item.userId);
        }
      }
    }

    const trends = Array.from(grouped.entries())
      .map(([label, data]) => ({
        label,
        totalPay: data.totalPay,
        employeeCount: data.employeeCount.size,
        periodCount: data.periodCount,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const result = { period, trends };
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async getActivity(p: AuthPrincipal) {
    if (!this.can(p, PERMISSIONS.AUDIT_READ_SCOPED)) {
      throw new ForbiddenException('Access denied');
    }

    const [auditLogs, notifications] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          tenantId: p.tenantId,
          action: { in: ['PAYROLL_EXPORT', 'ADMIN_ACTION'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.notification.findMany({
        where: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          category: 'PAYROLL',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const items: Array<{
      id: string;
      type: 'payroll_run' | 'report_generation' | 'compliance_alert' | 'employee_update';
      title: string;
      description: string;
      timestamp: string;
      actorName?: string;
    }> = [];

    for (const log of auditLogs) {
      const meta = (log.metadata ?? {}) as Record<string, unknown>;
      items.push({
        id: log.id,
        type: meta.format ? 'report_generation' : 'payroll_run',
        title: meta.format ? `Report exported as ${meta.format}` : 'Payroll action performed',
        description: `Payroll ${meta.action ?? 'update'} — ${meta.format ?? 'system'} action`,
        timestamp: log.createdAt.toISOString(),
        actorName: log.actorId ?? undefined,
      });
    }

    for (const notif of notifications) {
      items.push({
        id: notif.id,
        type: 'compliance_alert',
        title: notif.title,
        description: notif.message,
        timestamp: notif.createdAt.toISOString(),
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { items: items.slice(0, 20) };
  }

  async getCompliance(p: AuthPrincipal) {
    if (!this.can(p, PERMISSIONS.PAYROLL_READ)) {
      throw new ForbiddenException('Only Finance/Admin can view compliance status');
    }

    const cacheKey = 'finance:compliance';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const where = { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null };

    const [totalPeriods, exportedPeriods, lockedPeriods, totalUsers, eligibleUsers, timesheets] = await Promise.all([
      this.prisma.payrollPeriod.count({ where }),
      this.prisma.payrollPeriod.count({ where: { ...where, status: 'EXPORTED' } }),
      this.prisma.payrollPeriod.count({ where: { ...where, status: { in: ['LOCKED', 'EXPORTED'] } } }),
      this.prisma.user.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { ...where, payrollEligible: true, status: 'ACTIVE', employmentType: { not: 'INTERN' } } }),
      this.prisma.timesheet.count({
        where: { ...where, status: 'PAYROLL_READY', deletedAt: null },
      }),
    ]);

    const periodCompliance = totalPeriods > 0 ? (exportedPeriods / totalPeriods) * 100 : 100;
    const coverageRatio = totalUsers > 0 ? (eligibleUsers / totalUsers) * 100 : 100;
    const score = Math.round(periodCompliance * 0.6 + coverageRatio * 0.4);

    const lastScan = await this.prisma.auditLog.findFirst({
      where: { tenantId: p.tenantId, entityType: 'payroll_period' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const result = {
      lastScan: lastScan?.createdAt.toISOString() ?? null,
      complianceScore: Math.min(score, 100),
      payrollHealth: score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor',
      metrics: {
        exportedPeriods,
        totalPeriods,
        eligibleUsers,
        totalUsers,
        payrollReadyTimesheets: timesheets,
        lockedPeriods,
      },
    };

    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async getDepartments(p: AuthPrincipal) {
    if (!this.can(p, PERMISSIONS.PAYROLL_READ)) {
      throw new ForbiddenException('Only Finance/Admin can view department allocation');
    }

    const cacheKey = 'finance:departments';
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const latestReport = await this.prisma.payrollReport.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: {
          include: {
            user: {
              select: { department: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    let departments: { id: string; name: string; amount: number; percentage: number }[] = [];
    let totalSpend = 0;

    if (latestReport && latestReport.lineItems.length > 0) {
      const deptMap = new Map<string, { id: string; name: string; amount: number }>();
      for (const item of latestReport.lineItems) {
        const dept = item.user.department;
        const deptId = dept?.id ?? 'unknown';
        const deptName = dept?.name ?? 'Unassigned';
        const amount = Number(item.estimatedPay);
        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, { id: deptId, name: deptName, amount: 0 });
        }
        deptMap.get(deptId)!.amount += amount;
        totalSpend += amount;
      }

      departments = Array.from(deptMap.values()).map((d) => ({
        ...d,
        percentage: totalSpend > 0 ? Math.round((d.amount / totalSpend) * 100) : 0,
      })).sort((a, b) => b.amount - a.amount);
    }

    const result = { totalSpend, departments };
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async exportDashboard(p: AuthPrincipal, dto: ExportDashboardDto) {
    if (!this.can(p, PERMISSIONS.PAYROLL_EXPORT)) {
      throw new ForbiddenException('Only Finance/Admin can export dashboard data');
    }

    const jobId = randomUUID();
    await this.analyticsQueue.add(
      'dashboard-export',
      {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        actorId: p.userId,
        format: dto.format ?? 'PDF',
        periodId: dto.periodId,
      },
      { jobId, attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
    );

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'finance_dashboard',
        entityId: null,
        metadata: { jobId, format: dto.format ?? 'PDF', type: 'dashboard_export' },
      },
    });

    return { jobId, message: 'Export queued. You will be notified when ready.' };
  }
}
