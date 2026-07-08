import { Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  // ─── Admin: System Overview ───────────────────────────────────────────────

  @Get('overview')
  @RequirePermissions('dashboard:read_admin')
  @ApiOperation({ summary: 'System Overview KPI cards — health, users, approvals, payroll, sessions (Admin only)' })
  overview(@CurrentUser() u: AuthPrincipal) {
    return this.svc.adminOverview(u.tenantId, u);
  }

  @Get('activity')
  @RequirePermissions('dashboard:read_admin')
  @ApiOperation({ summary: 'Daily activity time series for the last N days (Admin only)' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Defaults to 14, max 90' })
  activity(@CurrentUser() u: AuthPrincipal, @Query() query: { days?: string }) {
    return this.svc.adminActivity(u.tenantId, u, query);
  }

  @Get('charts')
  @RequirePermissions('dashboard:read_admin')
  @ApiOperation({ summary: 'Employee growth + organization statistics chart data (Admin only)' })
  charts(@CurrentUser() u: AuthPrincipal) {
    return this.svc.adminCharts(u.tenantId, u);
  }

  @Get('recent')
  @RequirePermissions('dashboard:read_admin')
  @ApiOperation({ summary: 'Recent audit logs, approvals, payroll generations, and registrations (Admin only)' })
  recent(@CurrentUser() u: AuthPrincipal) {
    return this.svc.adminRecent(u.tenantId, u);
  }

  @Get('export')
  @RequirePermissions('dashboard:read_admin')
  @ApiOperation({ summary: 'Full System Overview snapshot for export — every export is audit-logged (Admin only)' })
  export(@CurrentUser() u: AuthPrincipal) {
    return this.svc.adminExport(u.tenantId, u);
  }

  // ─── HR Dashboard ─────────────────────────────────────────────────────────

  @Get('hr/summary')
  @RequirePermissions('dashboard:read_org')
  @ApiOperation({ summary: 'HR Dashboard summary cards — total payroll, active employees, pending timesheets, AI efficiency score (HR / Admin)' })
  hrSummary(@CurrentUser() u: AuthPrincipal) {
    return this.svc.hrSummary(u.tenantId, u);
  }

  @Get('hr/executive-summary')
  @RequirePermissions('dashboard:read_org')
  @ApiOperation({ summary: 'Executive AI summary — utilization, action recommendations, forecasted risk (HR / Admin)' })
  hrExecutiveSummary(@CurrentUser() u: AuthPrincipal) {
    return this.svc.hrExecutiveSummary(u.tenantId, u);
  }

  @Post('hr/executive-summary/generate')
  @RequirePermissions('dashboard:read_org')
  @ApiOperation({ summary: 'Regenerate the Executive AI Summary and persist an AI job/result (HR / Admin)' })
  hrGenerateReport(@CurrentUser() u: AuthPrincipal) {
    return this.svc.hrGenerateReport(u.tenantId, u);
  }

  @Get('hr/departments')
  @RequirePermissions('dashboard:read_org')
  @ApiOperation({ summary: 'Departmental analytics — headcount, payroll allocation, attendance, efficiency (HR / Admin)' })
  hrDepartments(@CurrentUser() u: AuthPrincipal) {
    return this.svc.hrDepartments(u.tenantId, u);
  }

  @Get('hr/recent')
  @RequirePermissions('dashboard:read_org')
  @ApiOperation({ summary: 'Recent activity feed — onboarding, payroll, timesheet, audit events (HR / Admin)' })
  hrRecent(@CurrentUser() u: AuthPrincipal) {
    return this.svc.hrRecent(u.tenantId, u);
  }

  @Get('hr/export')
  @RequirePermissions('dashboard:read_org')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="hr-dashboard-export.csv"')
  @ApiOperation({ summary: 'CSV export of HR dashboard summary + department analytics — audit-logged (HR / Admin)' })
  async hrExport(@CurrentUser() u: AuthPrincipal, @Res({ passthrough: true }) res: Response) {
    const csv = await this.svc.hrExportCsv(u.tenantId, u);
    res.send(csv);
  }

  @Get('hr/ai-insights')
  @RequirePermissions('dashboard:read_org')
  @ApiOperation({ summary: 'HR AI Insights — summary cards, payroll oversight, AI actions, timesheet status, attendance trends (HR / Admin)' })
  hrAiInsights(@CurrentUser() u: AuthPrincipal) {
    return this.svc.hrAiInsights(u.tenantId, u);
  }
}
