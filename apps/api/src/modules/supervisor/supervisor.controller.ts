import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupervisorService } from './supervisor.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { BulkApproveTimesheetsDto } from '../timesheets/dto';
import {
  SupervisorDailyScrumsQuery,
  SupervisorPendingTimesheetsQuery,
  SupervisorProductivityQuery,
  SupervisorTeamKpisQuery,
} from './dto';

@ApiTags('Supervisor')
@ApiBearerAuth('access-token')
@Controller({ path: 'supervisor', version: '1' })
export class SupervisorController {
  constructor(private readonly svc: SupervisorService) {}

  @Get('dashboard')
  @RequirePermissions('timesheet:read_team')
  dashboard(@CurrentUser() u: AuthPrincipal) {
    return this.svc.dashboard(u);
  }

  @Get('pending-timesheets')
  @RequirePermissions('timesheet:read_team')
  pendingTimesheets(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorPendingTimesheetsQuery) {
    return this.svc.pendingTimesheets(u, query);
  }

  @Get('daily-scrums')
  @RequirePermissions('scrum:read_team')
  dailyScrums(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorDailyScrumsQuery) {
    return this.svc.dailyScrums(u, query);
  }

  @Get('team-kpis')
  @RequirePermissions('kpi_progress:read_team')
  teamKpis(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorTeamKpisQuery) {
    return this.svc.teamKpis(u, query);
  }

  @Get('productivity-summary')
  @RequirePermissions('timesheet:read_team')
  productivitySummary(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorProductivityQuery) {
    return this.svc.productivitySummary(u, query);
  }

  @Post('bulk-approve')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  bulkApprove(@CurrentUser() u: AuthPrincipal, @Body() dto: BulkApproveTimesheetsDto) {
    return this.svc.bulkApprove(u, dto);
  }
}
