import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { StorageService } from '../../../api/src/modules/storage/storage.service';

export interface FinanceAnalyticsJobData {
  tenantId: string;
  organizationId: string;
  actorId: string;
  format: 'PDF' | 'CSV' | 'XLSX';
  periodId?: string;
}

interface FinanceMetric {
  label: string;
  value: string;
}

@Processor('finance-analytics')
export class FinanceAnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceAnalyticsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<FinanceAnalyticsJobData>): Promise<{ key: string; url: string }> {
    const { tenantId, organizationId, actorId, format, periodId } = job.data;
    this.logger.log(`Finance analytics export for org ${organizationId}, format ${format}`);

    const metrics = await this.loadMetrics(tenantId, organizationId, periodId);
    const timestamp = Date.now();
    const key = `finance/dashboard_${organizationId}_${timestamp}.${format.toLowerCase()}`;

    if (format === 'CSV') {
      const csvLines = ['Metric,Value'];
      for (const m of metrics) {
        csvLines.push(`${m.label},${m.value}`);
      }
      const buffer = Buffer.from(csvLines.join('\n'), 'utf-8');
      await this.storage.put(key, buffer, { contentType: 'text/csv' });
    } else if (format === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Finance Dashboard');
      sheet.columns = [
        { header: 'Metric', key: 'label', width: 35 },
        { header: 'Value', key: 'value', width: 25 },
      ];
      for (const m of metrics) {
        sheet.addRow({ label: m.label, value: m.value });
      }
      const buf = await workbook.xlsx.writeBuffer();
      await this.storage.put(key, Buffer.from(buf as ArrayBuffer), {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.fontSize(18).text('Finance Dashboard Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(11).text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();
      for (const m of metrics) {
        doc.text(`${m.label}: ${m.value}`);
      }
      doc.end();
      const buffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });
      await this.storage.put(key, buffer, { contentType: 'application/pdf' });
    }

    const url = await this.storage.signedUrl(key, 3600 * 24 * 7);

    await (this.prisma as any).auditLog.create({
      data: {
        tenantId,
        organizationId,
        actorId,
        action: 'FINANCE_DASHBOARD_EXPORT',
        resource: 'FinanceDashboard',
        resourceId: organizationId,
        details: JSON.stringify({ format, periodId, key }),
        ipAddress: '127.0.0.1',
        userAgent: 'worker',
        createdBy: actorId,
      },
    }).catch(() => {});

    this.logger.log(`Finance analytics export complete: ${key}`);
    return { key, url };
  }

  private async loadMetrics(
    tenantId: string,
    organizationId: string,
    periodId?: string,
  ): Promise<FinanceMetric[]> {
    const metrics: FinanceMetric[] = [];

    const reportIdsFilter = periodId
      ? await this.prisma.payrollReport.findMany({
          where: { tenantId, organizationId, payrollPeriodId: periodId },
          select: { id: true },
        }).then((r) => r.map((x) => x.id))
      : undefined;

    const lineItemFilter = reportIdsFilter
      ? { payrollReportId: { in: reportIdsFilter } }
      : {};

    const [
      totalPayroll,
      activeEmployees,
      totalTimesheets,
      totalHours,
      totalProjects,
      totalClients,
    ] = await Promise.all([
      this.prisma.payrollLineItem.aggregate({
        where: { tenantId, organizationId, ...lineItemFilter },
        _sum: { estimatedPay: true, approvedHours: true, overtimeHours: true },
        _count: true,
      }),
      this.prisma.user.count({
        where: { tenantId, organizationId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.timesheet.count({
        where: { tenantId, organizationId, deletedAt: null },
      }),
      this.prisma.timesheet.aggregate({
        where: { tenantId, organizationId, deletedAt: null },
        _sum: { totalMinutes: true },
      }),
      this.prisma.project.count({
        where: { tenantId, organizationId, deletedAt: null },
      }),
      this.prisma.client.count({
        where: { tenantId, organizationId, deletedAt: null },
      }),
    ]);

    const pay = totalPayroll._sum.estimatedPay ?? 0;
    const approvedHours = totalPayroll._sum.approvedHours ?? 0;
    const overtimeHours = totalPayroll._sum.overtimeHours ?? 0;
    const grossHours = Number(totalHours._sum.totalMinutes ?? 0) / 60;
    const payrollLines = totalPayroll._count ?? 0;

    metrics.push({ label: 'Active Employees', value: String(activeEmployees) });
    metrics.push({ label: 'Total Projects', value: String(totalProjects) });
    metrics.push({ label: 'Total Clients', value: String(totalClients) });
    metrics.push({ label: 'Total Timesheets', value: String(totalTimesheets) });
    metrics.push({ label: 'Gross Hours Logged', value: `${grossHours.toFixed(1)}h` });
    metrics.push({ label: 'Total Payroll Cost', value: `₱${Number(pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` });
    metrics.push({ label: 'Approved Hours', value: `${Number(approvedHours).toFixed(1)}h` });
    metrics.push({ label: 'Overtime Hours', value: `${Number(overtimeHours).toFixed(1)}h` });
    metrics.push({ label: 'Payroll Lines', value: String(payrollLines) });

    if (activeEmployees > 0) {
      const avgCost = Number(pay) / activeEmployees;
      metrics.push({ label: 'Avg Cost per Employee', value: `₱${avgCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` });
    }

    if (Number(grossHours) > 0) {
      const avgRate = Number(pay) / grossHours;
      metrics.push({ label: 'Effective Hourly Rate', value: `₱${avgRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` });
    }

    const recentPeriods = await this.prisma.payrollPeriod.findMany({
      where: { tenantId, organizationId },
      orderBy: { startDate: 'desc' },
      take: 3,
      select: { id: true, type: true, startDate: true, endDate: true },
    });
    for (const period of recentPeriods) {
      const reportsInPeriod = await this.prisma.payrollReport.findMany({
        where: { tenantId, organizationId, payrollPeriodId: period.id },
        select: { id: true },
      });
      const reportIds = reportsInPeriod.map((r) => r.id);
      const periodPay = reportIds.length > 0
        ? await this.prisma.payrollLineItem.aggregate({
            where: { tenantId, organizationId, payrollReportId: { in: reportIds } },
            _sum: { estimatedPay: true },
          })
        : { _sum: { estimatedPay: new Prisma.Decimal(0) } };
      const label = `Payroll Cost — ${period.type} (${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)})`;
      metrics.push({
        label,
        value: `₱${Number(periodPay._sum.estimatedPay ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      });
    }

    return metrics;
  }
}
