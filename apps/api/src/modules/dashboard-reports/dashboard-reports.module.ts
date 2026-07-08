import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

// Note: the old ReportsController (routes: timesheets/payroll/kpi/productivity)
// was removed — it duplicated the 'reports' path already owned by
// apps/api/src/modules/reports/reports.module.ts, silently shadowing that
// module's routes of the same name. Nothing in the frontend called this
// controller directly; DashboardService.reportTimesheets/reportPayroll/
// reportKpi/productivity are kept (unused for now) rather than deleted.
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardReportsModule {}
