import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Header,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ReportsService, ReportsQuery, AttendanceReportQuery } from './reports.service';
import { AuthPrincipal, CurrentUser } from '../../common/decorators';
import { ReportCategory } from '@prisma/client';

export class GenerateReportDto {
  category!: ReportCategory;
  format!: 'PDF' | 'CSV' | 'XLSX';
  userId?: string;
  departmentId?: string;
  teamId?: string;
  from?: string;
  to?: string;
}

@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('dashboard')
  async getDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getDashboardData(u, query);
  }

  @Get('attendance')
  async getAttendance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getAttendance(u, query);
  }

  @Get('attendance-report')
  async getAttendanceReport(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: AttendanceReportQuery,
  ) {
    return this.svc.getAttendanceReport(u, query);
  }

  @Get('attendance-report/export')
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
  async getPayroll(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getPayrollStats(u, query);
  }

  @Get('timesheets')
  async getTimesheets(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getTimesheetsStats(u, query);
  }

  @Get('labor-cost')
  async getLaborCost(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getLaborCost(u, query);
  }

  @Get('compliance')
  async getCompliance(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getComplianceStats(u, query);
  }

  @Get('departments')
  async getDepartments(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getDepartmentsStats(u, query);
  }

  @Get('history')
  async getHistory(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getHistory(u, query);
  }

  @Post('generate')
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
  async auditDownload(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: { reportId: string },
  ) {
    return this.svc.auditDownload(u, dto.reportId);
  }

  @Delete(':id')
  async deleteReport(
    @CurrentUser() u: AuthPrincipal,
    @Param('id') id: string,
  ) {
    return this.svc.deleteReport(u, id);
  }

  @Get('team-productivity')
  async getTeamProductivity(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getTeamProductivity(u, query);
  }

  @Get('team-productivity/summary')
  async getTeamProductivitySummary(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: ReportsQuery,
  ) {
    return this.svc.getTeamProductivitySummary(u, query);
  }
}
