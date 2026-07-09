import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../api/src/common/prisma/prisma.service';
import { MailerService } from '../../../api/src/infra/mailer.service';

export interface NotificationDeliveryJobData {
  notificationId: string;
  tenantId: string;
  organizationId: string;
  userId: string;
  email: string;
  title: string;
  message: string;
  channel: 'IN_APP' | 'EMAIL';
}

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {
    super();
  }

  async process(job: Job<NotificationDeliveryJobData>): Promise<void> {
    const { notificationId, title, message, email, channel } = job.data;
    this.logger.log(`Processing notification job ${job.id}: "${title}" (channel: ${channel})`);

    try {
      if (channel === 'EMAIL') {
        await this.mailer.send(email, title, message);
      }

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'SENT' },
      });

      this.logger.log(`Notification ${notificationId} delivered (${channel})`);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to deliver notification ${notificationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      }).catch(() => {});
      throw err;
    }
  }
}
