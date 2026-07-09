import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FinanceAiController } from './finance-ai.controller';
import { FinanceAiService } from './finance-ai.service';
import { FinanceModule } from '../finance/finance.module';
import { PayrollModule } from '../payroll/payroll.module';
import { ReportsModule } from '../reports/reports.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InfraModule } from '../../infra/infra.module';

@Module({
  imports: [
    FinanceModule,
    PayrollModule,
    ReportsModule,
    NotificationsModule,
    InfraModule,
    BullModule.registerQueue({ name: 'finance-ai' }),
  ],
  controllers: [FinanceAiController],
  providers: [FinanceAiService],
})
export class FinanceAiModule {}
