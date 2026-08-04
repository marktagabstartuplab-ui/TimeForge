import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPeriodScheduler } from './payroll-period.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { BirTaxService } from './bir-tax.service';
import { DeductionService } from './deduction.service';
import { PayrollSettingsService } from './payroll-settings.service';

@Module({
  imports: [
    NotificationsModule,
    BullModule.registerQueue({ name: 'payroll-export' }),
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollSettingsService, DeductionService, BirTaxService, PayrollPeriodScheduler],
  exports: [PayrollService, PayrollSettingsService, DeductionService, BirTaxService, PayrollPeriodScheduler],
})
export class PayrollModule {}
