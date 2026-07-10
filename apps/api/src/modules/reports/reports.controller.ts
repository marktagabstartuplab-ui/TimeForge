import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ReportsService, ReportsQuery, AttendanceReportQuery } from './reports.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ReportCategory } from '@prisma/client';

const REPORT_FORMATS = ['PDF', 'CSV', 'XLSX'] as const;

export class GenerateReportDto {
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @IsEnum(REPORT_FORMATS)
  format!: 'PDF' | 'CSV' | 'XLSX';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('dashboard:read_team')
  async getDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getDashboardData(u, query);
  }

  @Get('attendance')
  @RequirePermissions('attendance:read_org')
  async getAttendance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getAttendance(u, query);
  }

  @Get('attendance-report')
  @RequirePermissions('attendance:read_org')
  async getAttendanceReport(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: AttendanceReportQuery,
  ) {
    return this.svc.getAttendanceReport(u, query);
  }

  @Get('attendance-report/export')
  @RequirePermissions('attendance:read_org')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment')
  async exportAttendanceReport(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: AttendanceReportQuery & { format: 'CSV' | 'XLSX' | 'PDF' },
  ) {
    const result = await this.svc.exportAttendanceReport(u, query);
    return result.csv;
  }

  @Get('payroll')
  @RequirePermissions('payroll:read')
  async getPayroll(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getPayrollStats(u, query);
  }

  @Get('timesheets')
  @RequirePermissions('timesheet:read_org')
  async getTimesheets(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getTimesheetsStats(u, query);
  }

  @Get('labor-cost')
  @RequirePermissions('payroll:read')
  async getLaborCost(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getLaborCost(u, query);
  }

  @Get('compliance')
  @RequirePermissions('dashboard:read_org')
  async getCompliance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getComplianceStats(u, query);
  }

  @Get('departments')
  @RequirePermissions('org:read_dashboard')
  async getDepartments(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getDepartmentsStats(u, query);
  }

  @Get('history')
  @RequirePermissions('dashboard:read_team')
  async getHistory(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getHistory(u, query);
  }

  @Post('generate')
  @RequirePermissions('dashboard:read_org')
  async generateReport(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: GenerateReportDto,
  ) {
    return this.svc.triggerGeneration(u, dto.category, dto.format, {
      userId: dto.userId,
      departmentId: dto.departmentId,
      teamId: dto.teamId,
      from: dto.from,
      to: dto.to,
    });
  }

  @Post('export')
  @HttpCode(200)
  @RequirePermissions('audit:read_scoped')
  async auditDownload(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: { reportId: string },
  ) {
    return this.svc.auditDownload(u, dto.reportId);
  }

  @Delete(':id')
  @RequirePermissions('dashboard:read_admin')
  async deleteReport(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteReport(u, id);
  }

  @Get('team-productivity')
  @RequirePermissions('dashboard:read_team')
  async getTeamProductivity(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getTeamProductivity(u, query);
  }

  @Get('team-productivity/summary')
  @RequirePermissions('dashboard:read_team')
  async getTeamProductivitySummary(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getTeamProductivitySummary(u, query);
  }

  // ─── Finance Reports Endpoints ──────────────────────────────────────────────

  @Get('finance/dashboard')
  @RequirePermissions('dashboard:read_org')
  async getFinanceDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getFinanceDashboard(u, query);
  }

  @Get('finance/payroll-report')
  @RequirePermissions('payroll:read')
  async getFinancePayrollReport(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getFinancePayrollReport(u, query);
  }

  @Get('finance/overtime')
  @RequirePermissions('payroll:read')
  async getOvertimeAnalysis(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getOvertimeAnalysis(u, query);
  }
}
