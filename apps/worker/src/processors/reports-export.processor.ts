import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { StorageService } from '../../../api/src/modules/storage/storage.service';
import { ReportCategory, ReportStatus, Prisma } from '@prisma/client';

export interface ReportsExportJobData {
  tenantId: string;
  organizationId: string;
  reportId: string;
  category: ReportCategory;
  format: 'PDF' | 'CSV' | 'XLSX';
  actorId: string;
  query: Record<string, string>;
}

interface MetricRow {
  category: string;
  name: string;
  value: string;
}

@Processor('reports-export')
export class ReportsExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<ReportsExportJobData>): Promise<{ url?: string; key?: string }> {
    const { tenantId, organizationId, reportId, category, format } = job.data;
    this.logger.log(`[ReportsExportProcessor] Starting report generation job ${job.id} for report ${reportId}`);

    try {
      const metrics = await this.loadMetrics(tenantId, organizationId, category);

      const key = `reports/report_${reportId}_${Date.now()}.${format.toLowerCase()}`;

      if (format === 'CSV') {
        const csvLines = ['Category,Metric Name,Value'];
        for (const m of metrics) {
          csvLines.push(`${m.category},${m.name},${m.value}`);
        }
        const buffer = Buffer.from(csvLines.join('\n'), 'utf-8');
        await this.storage.put(key, buffer, { contentType: 'text/csv' });
      } else if (format === 'XLSX') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Report');
        sheet.columns = [
          { header: 'Category', key: 'category', width: 25 },
          { header: 'Metric Name', key: 'name', width: 30 },
          { header: 'Value', key: 'value', width: 25 },
        ];
        for (const m of metrics) {
          sheet.addRow({ category: m.category, name: m.name, value: m.value });
        }
        const excelBuffer = await workbook.xlsx.writeBuffer();
        const buffer = Buffer.from(excelBuffer as ArrayBuffer);
        await this.storage.put(key, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      } else {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        doc.fontSize(20).text(`Report: ${category}`, { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(12).text(`Generated: ${new Date().toISOString()}`);
        doc.moveDown();
        for (const m of metrics) {
          doc.text(`${m.name}: ${m.value}`);
        }

        doc.end();
        const buffer = await new Promise<Buffer>((resolve) => {
          doc.on('end', () => resolve(Buffer.concat(chunks)));
        });
        await this.storage.put(key, buffer, { contentType: 'application/pdf' });
      }

      const signedUrl = await this.storage.signedUrl(key, 3600 * 24 * 7);

      await this.prisma.generatedReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.COMPLETED, filePath: key },
      });

      this.logger.log(`[ReportsExportProcessor] Successfully finished report generation for report ${reportId}`);
      return { url: signedUrl, key };
    } catch (err: unknown) {
      this.logger.error(`[ReportsExportProcessor] Failed to generate report ${reportId}`, err instanceof Error ? err.stack : String(err));
      await this.prisma.generatedReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.FAILED },
      }).catch(() => {});
      throw err;
    }
  }

  private async loadMetrics(
    tenantId: string,
    organizationId: string,
    category: ReportCategory,
  ): Promise<MetricRow[]> {
    const metrics: MetricRow[] = [];
    const cat = category;

    const [
      totalUsers,
      activeUsers,
      timesheetSummary,
      payrollData,
      scrumData,
      sessionsData,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { tenantId, organizationId, deletedAt: null },
      }),
      this.prisma.user.count({
        where: { tenantId, organizationId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.timesheet.aggregate({
        where: { tenantId, organizationId, deletedAt: null },
        _sum: { totalMinutes: true },
        _count: true,
      }),
      this.prisma.payrollLineItem.aggregate({
        where: { tenantId, organizationId },
        _sum: { estimatedPay: true, approvedHours: true, overtimeHours: true },
        _count: true,
      }),
      this.prisma.scrumEntry.count({
        where: { tenantId, organizationId, deletedAt: null },
      }),
      this.prisma.workSession.aggregate({
        where: { tenantId, organizationId },
        _sum: { sessionDurationMinutes: true, breakMinutes: true },
      }),
    ]);

    const totalHours = Math.round((timesheetSummary._sum.totalMinutes ?? 0) / 60 * 10) / 10;
    const totalPay = payrollData._sum.estimatedPay ?? 0;
    const approvedHours = payrollData._sum.approvedHours ?? 0;
    const overtimeHours = payrollData._sum.overtimeHours ?? 0;
    const sessionHours = Math.round(((sessionsData._sum.sessionDurationMinutes ?? 0) - (sessionsData._sum.breakMinutes ?? 0)) / 60 * 10) / 10;
    const breakHours = Math.round((sessionsData._sum.breakMinutes ?? 0) / 60 * 10) / 10;

    if (cat === 'TIMESHEETS' || cat === 'ATTENDANCE' || cat === 'LABOR_COST') {
      metrics.push({ category: cat, name: 'Total Users', value: String(totalUsers) });
      metrics.push({ category: cat, name: 'Active Users', value: String(activeUsers) });
      metrics.push({ category: cat, name: 'Total Hours Logged', value: `${totalHours}h` });
      metrics.push({ category: cat, name: 'Focus Hours', value: `${sessionHours}h` });
      metrics.push({ category: cat, name: 'Break Hours', value: `${breakHours}h` });
      metrics.push({ category: cat, name: 'Timesheet Entries', value: String(timesheetSummary._count) });
    }

    if (cat === 'PAYROLL' || cat === 'LABOR_COST') {
      metrics.push({ category: cat, name: 'Total Payroll Cost', value: `₱${Number(totalPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` });
      metrics.push({ category: cat, name: 'Approved Hours', value: `${Number(approvedHours).toFixed(1)}h` });
      metrics.push({ category: cat, name: 'Overtime Hours', value: `${Number(overtimeHours).toFixed(1)}h` });
      metrics.push({ category: cat, name: 'Payroll Lines', value: String(payrollData._count) });
    }

    if (cat === 'COMPLIANCE' || cat === 'DEPARTMENT_ANALYTICS') {
      const departments = await this.prisma.department.findMany({
        where: { tenantId, organizationId, deletedAt: null },
        select: { id: true, name: true, _count: { select: { users: true, projects: true } } },
      });
      metrics.push({ category: cat, name: 'Departments', value: String(departments.length) });
      for (const dept of departments) {
        const deptTimesheets = await this.prisma.timesheet.count({
          where: {
            tenantId,
            organizationId,
            deletedAt: null,
            user: { departmentId: dept.id },
          },
        });
        metrics.push({ category: cat, name: `${dept.name} — Members`, value: String(dept._count.users) });
        metrics.push({ category: cat, name: `${dept.name} — Timesheets`, value: String(deptTimesheets) });
      }
    }

    metrics.push({ category: cat, name: 'Scrum Entries', value: String(scrumData) });
    metrics.push({ category: cat, name: 'Generated On', value: new Date().toISOString() });

    return metrics;
  }
}
