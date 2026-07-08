import { Module } from '@nestjs/common';
import { SupervisorController } from './supervisor.controller';
import { SupervisorService } from './supervisor.service';
import { ApprovalsModule } from '../approvals/approvals.module';
import { TimesheetsModule } from '../timesheets/timesheets.module';

@Module({
  imports: [ApprovalsModule, TimesheetsModule],
  controllers: [SupervisorController],
  providers: [SupervisorService],
})
export class SupervisorModule {}
