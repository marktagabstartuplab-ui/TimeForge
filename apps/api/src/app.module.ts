import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { InfraModule } from './infra/infra.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { HealthController } from './modules/health/health.controller';
import { RequestContextMiddleware } from './common/context/request-context';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
// Phase 6 — Core Organization modules
import { OrganizationModule } from './modules/organization/organization.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { WorkCategoriesModule } from './modules/work-categories/work-categories.module';
import { UsersModule } from './modules/users/users.module';
// Phase 7 — Lifecycle spine
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { WorkSessionsModule } from './modules/work-sessions/work-sessions.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
// Phase 8 — Smart Timesheets
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
// Phase 9 — Business modules
import { ScrumModule } from './modules/scrum/scrum.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { DashboardReportsModule } from './modules/dashboard-reports/dashboard-reports.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { NavigationModule } from './modules/navigation/navigation.module';
import { SecurityModule } from './modules/security/security.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SupervisorModule } from './modules/supervisor/supervisor.module';
import { SupervisorAiModule } from './modules/supervisor-ai/supervisor-ai.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FinanceAiModule } from './modules/finance-ai/finance-ai.module';
import { LeaveModule } from './modules/leave/leave.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage) =>
          (req.headers['x-request-id'] as string) || randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: true,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('redisUrl')!);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            password: url.password || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    InfraModule,
    StorageModule,
    AuthModule,
    RbacModule,
    // Phase 6
    OrganizationModule,
    DepartmentsModule,
    TeamsModule,
    ClientsModule,
    ProjectsModule,
    WorkCategoriesModule,
    UsersModule,
    // Phase 7
    TimeTrackingModule,
    WorkSessionsModule,
    AttachmentsModule,
    // Phase 8
    TimesheetsModule,
    // Phase 9
    ScrumModule,
    ApprovalsModule,
    KpiModule,
    PayrollModule,
    NotificationsModule,
    AuditLogsModule,
    DashboardReportsModule,
    AdminModule,
    AiModule,
    NavigationModule,
    SecurityModule,
    PerformanceModule,
    ReportsModule,
    SupervisorModule,
    SupervisorAiModule,
    SchedulesModule,
    FinanceModule,
    FinanceAiModule,
    LeaveModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
