import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { StorageService } from '../../../api/src/modules/storage/storage.service';
import { NotificationsService } from '../../../api/src/modules/notifications/notifications.service';
import type { PayrollExportJobData } from '../../../api/src/modules/payroll/payroll.service';

type LineItemRow = {
  approvedHours: unknown;
  pendingHours: unknown;
  rejectedHours: unknown;
  overtimeHours: unknown;
  hourlyRate: unknown;
  estimatedPay: unknown;
  user: { firstName: string; lastName: string; email: string };
};

type PeriodSummaryRow = {
  id: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  reports: { totals: unknown }[];
};

@Processor('payroll-export')
export class PayrollExportProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<PayrollExportJobData>): Promise<{ pdfKey?: string; xlsxKey?: string; csvKey?: string }> {
    const { tenantId, organizationId, periodId, format, actorId } = job.data;
    this.logger.log(`Payroll export START format=${format} period=${periodId ?? 'ORG_WIDE'}`);

    const result = periodId
      ? await this.exportSinglePeriod(tenantId, organizationId, periodId, format, job.id!)
      : await this.exportOrgWide(tenantId, organizationId, format, job.id!);

    const keys = result as { pdfKey?: string; xlsxKey?: string; csvKey?: string };
    const key = keys.pdfKey || keys.xlsxKey || keys.csvKey;
    if (key) {
      const url = await this.storage.signedUrl(key, 86_400);
      await this.notifications.create({
        tenantId,
        organizationId,
        userId: actorId,
        type: 'PAYROLL_READY',
        category: 'PAYROLL',
        title: 'Payroll export ready',
        message: `Your ${format} payroll export has finished generating.`,
        actionUrl: url,
        actionLabel: 'Download',
      });
    }

    return result;
  }

  // ── Single payroll period (detailed line items) ─────────────────────────

  private async exportSinglePeriod(
    tenantId: string,
    organizationId: string,
    periodId: string,
    format: PayrollExportJobData['format'],
    jobId: string,
  ): Promise<{ pdfKey?: string; xlsxKey?: string }> {
    const report = await this.prisma.payrollReport.findFirst({
      where: { payrollPeriodId: periodId, tenantId, organizationId, deletedAt: null },
      include: {
        period: true,
        lineItems: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!report) throw new Error(`No payroll report found for period ${periodId}`);

    const result: { pdfKey?: string; xlsxKey?: string } = {};

    if (format === 'PDF' || format === 'BOTH') {
      const buffer = await buildPeriodPdf(report.period.startDate, report.period.endDate, report.lineItems);
      const key = `exports/payroll-${periodId}-${jobId}.pdf`;
      await this.storage.put(key, buffer, { contentType: 'application/pdf' });
      result.pdfKey = key;
    }

    if (format === 'XLSX' || format === 'BOTH') {
      const buffer = await buildPeriodExcel(report.lineItems);
      const key = `exports/payroll-${periodId}-${jobId}.xlsx`;
      await this.storage.put(key, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      result.xlsxKey = key;
    }

    await this.prisma.payrollReport.update({
      where: { id: report.id },
      data: { ...(result.pdfKey ? { exportPdfKey: result.pdfKey } : {}), ...(result.xlsxKey ? { exportXlsxKey: result.xlsxKey } : {}) },
    });

    this.logger.log(`Payroll export SUCCEEDED period=${periodId} ${JSON.stringify(result)}`);
    return result;
  }

  // ── Org-wide summary across all periods (the dashboard's "Export Report") ──

  private async exportOrgWide(
    tenantId: string,
    organizationId: string,
    format: PayrollExportJobData['format'],
    jobId: string,
  ): Promise<{ pdfKey?: string; csvKey?: string }> {
    const periods = await this.prisma.payrollPeriod.findMany({
      where: { tenantId, organizationId, deletedAt: null },
      include: { reports: { select: { totals: true } } },
      orderBy: { startDate: 'desc' },
    });

    const result: { pdfKey?: string; csvKey?: string } = {};

    if (format === 'CSV') {
      const buffer = Buffer.from(buildOrgCsv(periods), 'utf-8');
      const key = `exports/payroll-org-summary-${jobId}.csv`;
      await this.storage.put(key, buffer, { contentType: 'text/csv' });
      result.csvKey = key;
    } else {
      const buffer = await buildOrgPdf(periods);
      const key = `exports/payroll-org-summary-${jobId}.pdf`;
      await this.storage.put(key, buffer, { contentType: 'application/pdf' });
      result.pdfKey = key;
    }

    this.logger.log(`Payroll org-wide export SUCCEEDED ${JSON.stringify(result)}`);
    return result;
  }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function totalsOf(row: PeriodSummaryRow): { headcount: number; totalEstimatedPay: number } {
  const totals = row.reports[0]?.totals as { headcount?: number; totalEstimatedPay?: string } | undefined;
  return { headcount: totals?.headcount ?? 0, totalEstimatedPay: Number(totals?.totalEstimatedPay ?? 0) };
}

async function buildPeriodPdf(startDate: Date, endDate: Date, lineItems: LineItemRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Payroll Report', { align: 'center' });
    doc.fontSize(11).text(`${formatDate(startDate)} – ${formatDate(endDate)}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10);
    for (const item of lineItems) {
      doc.text(
        `${item.user.firstName} ${item.user.lastName} (${item.user.email}) — Approved: ${item.approvedHours}h, OT: ${item.overtimeHours}h, Rate: ₱${item.hourlyRate}/hr, Est. Pay: ₱${item.estimatedPay}`,
      );
    }
    doc.end();
  });
}

async function buildPeriodExcel(lineItems: LineItemRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Payroll');
  sheet.columns = [
    { header: 'Employee', key: 'name', width: 28 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Approved Hours', key: 'approved', width: 16 },
    { header: 'Overtime Hours', key: 'overtime', width: 16 },
    { header: 'Hourly Rate', key: 'rate', width: 14, style: { numFmt: '"₱"#,##0.00' } },
    { header: 'Estimated Pay', key: 'pay', width: 16, style: { numFmt: '"₱"#,##0.00' } },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const item of lineItems) {
    sheet.addRow({
      name: `${item.user.firstName} ${item.user.lastName}`,
      email: item.user.email,
      approved: item.approvedHours,
      overtime: item.overtimeHours,
      rate: item.hourlyRate,
      pay: item.estimatedPay,
    });
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function buildOrgCsv(periods: PeriodSummaryRow[]): string {
  const lines = ['Pay Period,Type,Status,Headcount,Total Estimated Pay'];
  for (const p of periods) {
    const t = totalsOf(p);
    lines.push([`"${formatDate(p.startDate)} - ${formatDate(p.endDate)}"`, p.type, p.status, t.headcount, t.totalEstimatedPay.toFixed(2)].join(','));
  }
  return lines.join('\n');
}

async function buildOrgPdf(periods: PeriodSummaryRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Organization Payroll Summary', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10);
    for (const p of periods) {
      const t = totalsOf(p);
      doc.text(`${formatDate(p.startDate)} – ${formatDate(p.endDate)} (${p.type}) — Status: ${p.status} — Headcount: ${t.headcount} — Total: ₱${t.totalEstimatedPay.toFixed(2)}`);
    }
    doc.end();
  });
}
