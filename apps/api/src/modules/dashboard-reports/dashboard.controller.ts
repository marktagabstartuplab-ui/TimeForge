import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

const DATE_PARAMS = [
  { name: 'from',         description: 'ISO 8601 date — defaults to start of current month' },
  { name: 'to',           description: 'ISO 8601 date — defaults to today' },
] as const;

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  // ─── KPI Cards / Summary ──────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'KPI cards — scope auto-resolved (self / team / org)' })
  @ApiQuery({ name: 'from',         required: false, type: String, description: DATE_PARAMS[0].description })
  @ApiQuery({ name: 'to',           required: false, type: String, description: DATE_PARAMS[1].description })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  summary(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.summary(u.tenantId, u, query);
  }

  // ─── Progress (Today's Progress widget) ──────────────────────────────────

  @Get('progress')
  @RequirePermissions('dashboard:read_self')
  @ApiOperation({ summary: "Today's Hours, Weekly Hours, Break Time, Completed Tasks, Productivity, Completion %, KPI Progress — all server-computed" })
  progress(@CurrentUser() u: AuthPrincipal) {
    return this.svc.progress(u.tenantId, u);
  }

  // ─── Pending Approvals ────────────────────────────────────────────────────

  @Get('pending-approvals')
  @RequirePermissions('approval:decide')
  @ApiOperation({ summary: 'Pending timesheets awaiting approval (Supervisor / Admin)' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  @ApiQuery({ name: 'limit',        required: false, type: Number })
  @ApiQuery({ name: 'cursor',       required: false, type: String })
  pendingApprovals(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.pendingApprovals(u.tenantId, u, query);
  }

  // ─── Attendance ───────────────────────────────────────────────────────────

  @Get('attendance')
  @RequirePermissions('attendance:read_org')
  @ApiOperation({ summary: 'Org attendance trends by ISO week (HR / Admin)' })
  @ApiQuery({ name: 'from',         required: false, type: String, description: DATE_PARAMS[0].description })
  @ApiQuery({ name: 'to',           required: false, type: String, description: DATE_PARAMS[1].description })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  attendance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.attendance(u.tenantId, u, query);
  }

  // ─── Payroll Status ───────────────────────────────────────────────────────

  @Get('payroll-status')
  @RequirePermissions('payroll:read')
  @ApiOperation({ summary: 'Payroll period status overview (Finance / Admin)' })
  @ApiQuery({ name: 'from',   required: false, type: String, description: DATE_PARAMS[0].description })
  @ApiQuery({ name: 'to',     required: false, type: String, description: DATE_PARAMS[1].description })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'GENERATED', 'LOCKED', 'EXPORTED'] })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  payrollStatus(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.payrollStatus(u.tenantId, u, query);
  }

  // ─── Team Summary ─────────────────────────────────────────────────────────

  @Get('team-summary')
  @RequirePermissions('dashboard:read_team')
  @ApiOperation({ summary: 'Team member hours and KPI snapshot (Supervisor / Admin)' })
  @ApiQuery({ name: 'from',         required: false, type: String, description: DATE_PARAMS[0].description })
  @ApiQuery({ name: 'to',           required: false, type: String, description: DATE_PARAMS[1].description })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  @ApiQuery({ name: 'periodKey',    required: false, type: String, description: 'KPI period key e.g. 2026-Q2' })
  teamSummary(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.teamSummary(u.tenantId, u, query);
  }
}
