import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
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
  providers: [PayrollService, PayrollSettingsService, DeductionService, BirTaxService],
  exports: [PayrollService, PayrollSettingsService, DeductionService, BirTaxService],
})
export class PayrollModule {}
