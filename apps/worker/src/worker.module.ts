import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import configuration from '../../api/src/config/configuration';
import { validate } from '../../api/src/config/env.validation';
import { PrismaModule } from '../../api/src/common/prisma/prisma.module';
import { NotificationsService } from '../../api/src/modules/notifications/notifications.service';
import { NotificationsRealtimeService } from '../../api/src/modules/notifications/notifications-realtime.service';
import { NotificationsProcessor } from './processors/notifications.processor';
import { AiProcessor } from './processors/ai.processor';
import { OrganizationExportProcessor } from './processors/organization-export.processor';
import { PayrollExportProcessor } from './processors/payroll-export.processor';
import { PerformanceExportProcessor } from './processors/performance-export.processor';
import { ReportsExportProcessor } from './processors/reports-export.processor';
import { FinanceAnalyticsProcessor } from './processors/finance-analytics.processor';
import { FinanceAiProcessor } from './processors/finance-ai.processor';
import { SessionRolloverProcessor } from './processors/session-rollover.processor';
import { RecurringIssueDetectionProcessor } from './processors/recurring-issue-detection.processor';
import { OpenAiProvider } from './ai/openai.provider';
import { StorageModule } from '../../api/src/modules/storage/storage.module';
import { InfraModule } from '../../api/src/infra/infra.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    LoggerModule.forRoot({ pinoHttp: { autoLogging: false } }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('redisUrl')!);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: url.password || undefined,
            // Managed Redis providers (Upstash, some Railway plugins) require TLS via rediss://.
            tls: url.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'ai' }),
    BullModule.registerQueue({ name: 'organization-export' }),
    BullModule.registerQueue({ name: 'payroll-export' }),
    BullModule.registerQueue({ name: 'performance-export' }),
    BullModule.registerQueue({ name: 'reports-export' }),
    BullModule.registerQueue({ name: 'finance-analytics' }),
    BullModule.registerQueue({ name: 'finance-ai' }),
    BullModule.registerQueue({ name: 'session-rollover' }),
    BullModule.registerQueue({ name: 'recurring-issue-detection' }),
    PrismaModule,
    StorageModule,
    InfraModule,
  ],
  providers: [
    NotificationsService,
    NotificationsRealtimeService,
    NotificationsProcessor,
    AiProcessor,
    OrganizationExportProcessor,
    PayrollExportProcessor,
    PerformanceExportProcessor,
    ReportsExportProcessor,
    FinanceAnalyticsProcessor,
    FinanceAiProcessor,
    SessionRolloverProcessor,
    RecurringIssueDetectionProcessor,
    OpenAiProvider,
  ],
})
export class WorkerModule {}
