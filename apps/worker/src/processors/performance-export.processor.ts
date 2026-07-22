import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { StorageService } from '../../../api/src/modules/storage/storage.service';
import { registerPdfFonts, PDF_FONT, PDF_FONT_BOLD } from '../../../api/src/common/pdf/pdf-fonts';
import { NotificationsService } from '../../../api/src/modules/notifications/notifications.service';

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
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<PerformanceExportJobData>): Promise<{ url?: string; key?: string }> {
    const { tenantId, organizationId, userIds, format, actorId } = job.data;
    this.logger.log(`[PerformanceExportProcessor] Starting job ${job.id} for format ${format}`);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      include: {
        kpiProgress: {
          where: { deletedAt: null },
          include: { kpiTemplate: true },
        },
      },
    });

    // Fetch related logs for calculations
    const [timesheets, scrumTasks, workSessions, aiResults] = await Promise.all([
      this.prisma.timesheet.findMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.scrumTask.findMany({
        where: { employeeId: { in: userIds }, deletedAt: null },
      }),
      this.prisma.workSession.findMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.aiResult.findMany({
        where: {
          tenantId,
          job: {
            subjectId: { in: userIds },
            feature: 'PRODUCTIVITY_INSIGHT',
          },
        },
        include: { job: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

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
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      registerPdfFonts(doc);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));

      users.forEach((u, uIdx) => {
        if (uIdx > 0) {
          doc.addPage();
        }

        // Filter metrics for the current user
        const uTimesheets = timesheets.filter((t) => t.userId === u.id);
        const uScrumTasks = scrumTasks.filter((t) => t.employeeId === u.id);
        const uWorkSessions = workSessions.filter((t) => t.userId === u.id);
        const uAiResult = aiResults.find((r) => r.job.subjectId === u.id);

        // Compute metrics
        let totalKpiSum = 0;
        let kpiCount = 0;
        u.kpiProgress.forEach((k) => {
          const target = Number(k.targetValue || 1);
          const val = Number(k.currentValue || 0);
          totalKpiSum += Math.min(100, Math.round((val / target) * 100));
          kpiCount++;
        });
        const overallKpiScore = kpiCount > 0 ? Math.round(totalKpiSum / kpiCount) : 0;

        let totalActiveMins = 0;
        let totalBreakMins = 0;
        uWorkSessions.forEach((ws) => {
          const duration = ws.sessionDurationMinutes || 0;
          totalActiveMins += duration;
          totalBreakMins += ws.breakMinutes || 0;
        });
        const efficiencyScore = totalActiveMins + totalBreakMins > 0
          ? Math.round((totalActiveMins / (totalActiveMins + totalBreakMins)) * 100)
          : 0;

        const totalExpectedTimesheets = 4;
        const completedTimesheets = uTimesheets.filter((t) => t.status === 'APPROVED' || t.status === 'PAYROLL_READY').length;
        const attendanceRate = totalExpectedTimesheets > 0
          ? Math.min(100, Math.round((completedTimesheets / totalExpectedTimesheets) * 100))
          : 0;

        const totalTasks = uScrumTasks.length;
        const completedTasks = uScrumTasks.filter((t) => t.taskStatus === 'COMPLETED').length;
        const taskCompletionStr = totalTasks > 0 ? `${completedTasks}/${totalTasks}` : '0/0';
        const taskCompletionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        let recommendation = '';
        let actionGuide: string[] = [];
        if (uAiResult) {
          recommendation = uAiResult.recommendation || 'Focus on target alignments.';
          actionGuide = [
            'Schedule regular checkpoints with supervisor',
            'Reduce focus disruptions',
          ];
        } else {
          if (overallKpiScore < 50) {
            recommendation = `Concerned about your current performance at ${overallKpiScore}%. Your KPI completion rate is significantly below targets. This situation needs immediate attention, but you can turn it around with focused effort.`;
            actionGuide = [
              'Take immediate action to improve lower-performing KPIs today.',
              'Schedule a meeting with your supervisor to discuss blockers.',
              'Create a clear daily focus plan and stick to it.',
              'Ask for help — your team is here to support you.',
            ];
          } else if (overallKpiScore < 80) {
            recommendation = `Your performance score is satisfactory at ${overallKpiScore}%. You are showing consistent output, but there are areas where efficiency and alignment can be optimized further.`;
            actionGuide = [
              'Align daily tasks closer to sprint targets.',
              'Minimize breaks during peak hours to elevate your Focus Score.',
              'Ensure all timesheets are submitted and locked on time.',
            ];
          } else {
            recommendation = `Excellent job! You are performing above average at ${overallKpiScore}%. Keep up the high efficiency and focus.`;
            actionGuide = [
              'Maintain your current timesheet completion rates.',
              'Share focus and productivity tips with your team members.',
              'Pick up additional sprint targets or advanced KPI metrics.',
            ];
          }
        }

        // Draw Header Banner
        doc.save();
        doc.rect(50, 40, 512, 65).fill('#0f172a');
        doc.restore();

        doc.fillColor('#ffffff');
        doc.font(PDF_FONT_BOLD).fontSize(16).text('PERFORMANCE INSIGHTS REPORT', 65, 52);
        doc.font(PDF_FONT).fontSize(9).fillColor('#94a3b8')
          .text(`Employee: ${u.firstName} ${u.lastName} (${u.email})   |   Generated: ${new Date().toLocaleDateString()}`, 65, 75);

        // Draw Metric Cards
        const cardY = 120;
        const cardWidth = 118;
        const cardHeight = 60;
        const cardGap = 13;
        const metricsList = [
          { label: 'PERFORMANCE SCORE', value: `${overallKpiScore}%` },
          { label: 'EFFICIENCY SCORE', value: `${efficiencyScore}%` },
          { label: 'ATTENDANCE RATE', value: `${attendanceRate}%` },
          { label: 'TASK COMPLETION', value: `${taskCompletionStr} (${taskCompletionPct}%)` },
        ];

        metricsList.forEach((m, idx) => {
          const cardX = 50 + idx * (cardWidth + cardGap);
          doc.save();
          // Border
          doc.rect(cardX, cardY, cardWidth, cardHeight).lineWidth(1).stroke('#cbd5e1');
          doc.restore();

          // Text inside card
          doc.fillColor('#64748b').font(PDF_FONT_BOLD).fontSize(7).text(m.label, cardX + 8, cardY + 10, { width: cardWidth - 16 });
          doc.fillColor('#0f172a').font(PDF_FONT_BOLD).fontSize(13).text(m.value, cardX + 8, cardY + 28, { width: cardWidth - 16 });
        });

        // Draw KPI Table
        doc.fillColor('#0f172a').font(PDF_FONT_BOLD).fontSize(12).text('KPI Target Alignment', 50, 205);
        doc.save();
        doc.moveTo(50, 222).lineTo(562, 222).lineWidth(1).stroke('#e2e8f0');
        doc.restore();

        // Table Headers
        doc.fillColor('#64748b').font(PDF_FONT_BOLD).fontSize(8);
        doc.text('KPI Metric', 55, 230, { width: 170 });
        doc.text('Type', 230, 230, { width: 80 });
        doc.text('Actual', 320, 230, { width: 60 });
        doc.text('Target', 390, 230, { width: 60 });
        doc.text('Progress', 460, 230, { width: 95 });

        doc.save();
        doc.moveTo(50, 243).lineTo(562, 243).lineWidth(1.5).stroke('#cbd5e1');
        doc.restore();

        let currentY = 248;
        if (u.kpiProgress.length === 0) {
          doc.fillColor('#64748b').font(PDF_FONT).fontSize(9).text('No KPI templates configured for this employee.', 55, currentY + 5);
          currentY += 25;
        } else {
          u.kpiProgress.forEach((k) => {
            doc.fillColor('#0f172a').font(PDF_FONT_BOLD).fontSize(9).text(k.kpiTemplate.name, 55, currentY + 3, { width: 170 });
            doc.fillColor('#475569').font(PDF_FONT).fontSize(8).text(k.kpiTemplate.metricType, 230, currentY + 4, { width: 80 });
            doc.fillColor('#0f172a').font(PDF_FONT_BOLD).fontSize(9).text(String(k.currentValue), 320, currentY + 3, { width: 60 });
            doc.fillColor('#475569').font(PDF_FONT).fontSize(9).text(String(k.targetValue), 390, currentY + 3, { width: 60 });

            const progressPct = Number(k.targetValue) > 0 ? Math.min(100, Math.round((Number(k.currentValue) / Number(k.targetValue)) * 100)) : 0;
            doc.fillColor('#0f172a').font(PDF_FONT_BOLD).fontSize(9).text(`${progressPct}%`, 460, currentY + 3, { width: 95 });

            doc.save();
            doc.moveTo(50, currentY + 22).lineTo(562, currentY + 22).lineWidth(0.5).stroke('#e2e8f0');
            doc.restore();
            currentY += 25;
          });
        }

        // Draw Coach Advice Card
        const coachY = currentY + 15;
        doc.save();
        doc.rect(50, coachY, 512, 160).fill('#f0f9ff');
        doc.rect(50, coachY, 512, 160).lineWidth(1).stroke('#bae6fd');
        doc.restore();

        doc.fillColor('#0369a1').font(PDF_FONT_BOLD).fontSize(10).text('AI PERFORMANCE COACH ADVICE', 65, coachY + 12);
        doc.fillColor('#1e293b').font(PDF_FONT).fontSize(9.5).text(recommendation, 65, coachY + 28, { width: 482, lineGap: 3 });

        doc.fillColor('#0369a1').font(PDF_FONT_BOLD).fontSize(9).text('RECOMMENDED ACTION GUIDE:', 65, coachY + 80);
        let guideY = coachY + 95;
        actionGuide.forEach((step, stepIdx) => {
          doc.fillColor('#334155').font(PDF_FONT).fontSize(9).text(`${stepIdx + 1}. ${step.replace(/^\d+\.\s*/, '')}`, 65, guideY, { width: 482 });
          guideY += 14;
        });

        // Bottom Footer
        doc.fillColor('#94a3b8').font(PDF_FONT).fontSize(8).text('TimeForge Performance Management System — Confidential', 50, 740, { align: 'center' });
      });

      doc.end();

      const buffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });

      await this.storage.put(key, buffer, { contentType: 'application/pdf' });
    }

    const signedUrl = await this.storage.signedUrl(key, 3600);
    this.logger.log(`[PerformanceExportProcessor] Successfully finished export job ${job.id}`);

    await this.notifications.create({
      tenantId,
      organizationId,
      userId: actorId,
      type: 'ANNOUNCEMENT',
      category: 'PERFORMANCE',
      title: 'Performance export ready',
      message: `Your ${format} performance export has finished generating.`,
      actionUrl: signedUrl,
      actionLabel: 'Download',
    });

    return { url: signedUrl, key };
  }
}
