import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { StorageService } from '../../../api/src/modules/storage/storage.service';

export interface PerformanceExportJobData {
  tenantId: string;
  organizationId: string;
  userIds: string[];
  format: 'CSV' | 'XLSX' | 'PDF';
  actorId: string;
}

@Processor('performance-export')
export class PerformanceExportProcessor extends WorkerHost {
  private readonly logger = new Logger(PerformanceExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<PerformanceExportJobData>): Promise<{ url?: string; key?: string }> {
    const { tenantId, organizationId, userIds, format } = job.data;
    this.logger.log(`[PerformanceExportProcessor] Starting job ${job.id} for format ${format}`);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      include: {
        securityLogs: { take: 5 },
        kpiProgress: { include: { kpiTemplate: true } },
      },
    });

    const key = `exports/performance_${job.id}_${Date.now()}.${format.toLowerCase()}`;

    if (format === 'CSV') {
      const csvLines = ['User ID,Name,Email,KPI Module,Current Value,Target Value,Score'];
      users.forEach((u) => {
        u.kpiProgress.forEach((k) => {
          const score = Number(k.targetValue) > 0 ? Math.min(100, Math.round((Number(k.currentValue) / Number(k.targetValue)) * 100)) : 0;
          csvLines.push(
            [
              u.id,
              `"${u.firstName} ${u.lastName}"`,
              u.email,
              `"${k.kpiTemplate.name}"`,
              k.currentValue,
              k.targetValue,
              score,
            ].join(','),
          );
        });
      });
      const buffer = Buffer.from(csvLines.join('\n'), 'utf-8');
      await this.storage.put(key, buffer, { contentType: 'text/csv' });
    } else if (format === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Performance');
      sheet.columns = [
        { header: 'User ID', key: 'id', width: 36 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'KPI Module', key: 'kpi', width: 30 },
        { header: 'Current Value', key: 'current', width: 15 },
        { header: 'Target Value', key: 'target', width: 15 },
        { header: 'Score %', key: 'score', width: 10 },
      ];

      users.forEach((u) => {
        u.kpiProgress.forEach((k) => {
          const score = Number(k.targetValue) > 0 ? Math.min(100, Math.round((Number(k.currentValue) / Number(k.targetValue)) * 100)) : 0;
          sheet.addRow({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            email: u.email,
            kpi: k.kpiTemplate.name,
            current: Number(k.currentValue),
            target: Number(k.targetValue),
            score,
          });
        });
      });

      const excelBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(excelBuffer as ArrayBuffer);
      await this.storage.put(key, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else {
      // PDF format
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));

      doc.fontSize(20).text('Employee Performance Audit Report', { align: 'center' });
      doc.moveDown(2);

      users.forEach((u) => {
        doc.fontSize(14).text(`Employee: ${u.firstName} ${u.lastName} (${u.email})`, { underline: true });
        doc.moveDown(0.5);

        u.kpiProgress.forEach((k) => {
          const score = Number(k.targetValue) > 0 ? Math.min(100, Math.round((Number(k.currentValue) / Number(k.targetValue)) * 100)) : 0;
          doc.fontSize(10).text(`- KPI: ${k.kpiTemplate.name} | Progress: ${k.currentValue}/${k.targetValue} (${score}%)`);
        });

        doc.moveDown(1.5);
      });

      doc.end();

      const buffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });

      await this.storage.put(key, buffer, { contentType: 'application/pdf' });
    }

    const signedUrl = await this.storage.signedUrl(key, 3600);
    this.logger.log(`[PerformanceExportProcessor] Successfully finished export job ${job.id}`);
    
    return { url: signedUrl, key };
  }
}
