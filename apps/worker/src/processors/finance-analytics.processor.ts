import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

interface DashboardExportJob {
  tenantId: string;
  organizationId: string;
  actorId: string;
  format: string;
  periodId?: string;
}

@Processor('finance-analytics')
export class FinanceAnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceAnalyticsProcessor.name);

  async process(job: Job<DashboardExportJob>): Promise<void> {
    this.logger.log(`Processing finance-analytics job ${job.id} (${job.name})`);

    switch (job.name) {
      case 'dashboard-export':
        await this.handleDashboardExport(job.data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleDashboardExport(data: DashboardExportJob): Promise<void> {
    this.logger.log(
      `Dashboard export for org ${data.organizationId} in format ${data.format} ` +
      `requested by user ${data.actorId}`,
    );

    // TODO: Generate actual export file (PDF/CSV/XLSX) based on dashboard data
    // For now, the audit log entry created by the API is sufficient to track the export.
    // File generation and notification delivery will be added in a follow-up.
    this.logger.log(`Dashboard export job ${data.format} completed`);
  }
}
