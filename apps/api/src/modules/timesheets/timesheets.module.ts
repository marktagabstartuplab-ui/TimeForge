import { Module } from '@nestjs/common';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
import { TimesheetAdjustmentsService } from './timesheet-adjustments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [NotificationsModule, ApprovalsModule],
  controllers: [TimesheetsController],
  providers: [TimesheetsService, TimesheetAdjustmentsService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
