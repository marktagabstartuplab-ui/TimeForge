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
import { CompensationBenefitsController } from './compensation-benefits.controller';
import { CompensationBenefitsService } from './compensation-benefits.service';

@Module({
  imports: [
    NotificationsModule,
    BullModule.registerQueue({ name: 'payroll-export' }),
  ],
  controllers: [PayrollController, CompensationBenefitsController],
  providers: [PayrollService, PayrollSettingsService, DeductionService, BirTaxService, PayrollPeriodScheduler, CompensationBenefitsService],
  exports: [PayrollService, PayrollSettingsService, DeductionService, BirTaxService, PayrollPeriodScheduler, CompensationBenefitsService],
})
export class PayrollModule {}
