import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly svc: DashboardService) {}

  // ─── Timesheet Report ─────────────────────────────────────────────────────

  @Get('timesheets')
  @RequirePermissions('timesheet:read_org')
  @ApiOperation({ summary: 'Paginated timesheet report with aggregated totals (HR / Admin)' })
  @ApiQuery({ name: 'from',         required: false, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'to',           required: false, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'userId',       required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  @ApiQuery({ name: 'status',       required: false, enum: ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REVISION_REQUESTED','PAYROLL_READY'] })
  @ApiQuery({ name: 'limit',        required: false, type: Number })
  @ApiQuery({ name: 'cursor',       required: false, type: String })
  timesheets(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.reportTimesheets(u.tenantId, u, query);
  }

  // ─── Payroll Report ───────────────────────────────────────────────────────

  @Get('payroll')
  @RequirePermissions('payroll:read')
  @ApiOperation({ summary: 'Paginated payroll period report (Finance / Admin)' })
  @ApiQuery({ name: 'from',   required: false, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'to',     required: false, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN','GENERATED','LOCKED','EXPORTED'] })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  payroll(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.reportPayroll(u.tenantId, u, query);
  }

  // ─── KPI Report ───────────────────────────────────────────────────────────

  @Get('kpi')
  @RequirePermissions('kpi:read_org')
  @ApiOperation({ summary: 'KPI progress report across users and templates (Supervisor / Admin)' })
  @ApiQuery({ name: 'userId',       required: false, type: String })
  @ApiQuery({ name: 'periodKey',    required: false, type: String, description: 'e.g. 2026-Q2' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  @ApiQuery({ name: 'limit',        required: false, type: Number })
  @ApiQuery({ name: 'cursor',       required: false, type: String })
  kpi(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.reportKpi(u.tenantId, u, query);
  }

  // ─── Productivity Report ──────────────────────────────────────────────────

  @Get('productivity')
  @RequirePermissions('dashboard:read_team')
  @ApiOperation({ summary: 'Hours by user and project (Supervisor / Admin)' })
  @ApiQuery({ name: 'from',         required: false, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'to',           required: false, type: String, description: 'ISO 8601 date' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId',       required: false, type: String })
  @ApiQuery({ name: 'projectId',    required: false, type: String })
  productivity(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.productivity(u.tenantId, u, query);
  }

  // ─── Attendance Report ─────────────────────────────────────────────────────

  @Get('attendance-report')
  @RequirePermissions('attendance:read_org')
  @ApiOperation({ summary: 'Paginated per-employee attendance report — days logged, absences, tardiness (HR / Admin)' })
  @ApiQuery({ name: 'search',         required: false, type: String })
  @ApiQuery({ name: 'departmentId',   required: false, type: String })
  @ApiQuery({ name: 'payrollPeriodId', required: false, type: String })
  @ApiQuery({ name: 'from',           required: false, type: String, description: 'ISO 8601 date; ignored if payrollPeriodId is set' })
  @ApiQuery({ name: 'to',             required: false, type: String, description: 'ISO 8601 date; ignored if payrollPeriodId is set' })
  @ApiQuery({ name: 'status',         required: false, enum: ['PERFECT', 'EXCELLENT', 'GOOD', 'CRITICAL'] })
  @ApiQuery({ name: 'sortBy',         required: false, enum: ['name', 'attendancePercent', 'absences', 'tardiness', 'daysLogged'] })
  @ApiQuery({ name: 'sortDir',        required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page',           required: false, type: Number })
  @ApiQuery({ name: 'pageSize',       required: false, type: Number })
  attendance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.reportAttendance(u.tenantId, u, query);
  }

  @Get('attendance-report/export')
  @RequirePermissions('attendance:read_org')
  @ApiOperation({ summary: 'Export the attendance report as CSV/XLSX/PDF — every export is audit-logged (HR / Admin)' })
  @ApiQuery({ name: 'format', required: false, enum: ['CSV', 'XLSX', 'PDF'] })
  async exportAttendance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, filename } = await this.svc.exportAttendanceReport(u.tenantId, u, query);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return buffer;
  }
}
