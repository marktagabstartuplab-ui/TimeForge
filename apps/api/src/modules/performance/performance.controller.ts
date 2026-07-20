import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PerformanceService, PerformanceQuery } from './performance.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

// Undecorated fields are silently stripped by the global ValidationPipe's
// whitelist (main.ts), which made every export request 422 with "property
// format should not exist" regardless of what the client sent.
export class PerformanceExportDto {
  @IsIn(['CSV', 'XLSX', 'PDF'])
  format!: 'CSV' | 'XLSX' | 'PDF';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}

@Controller({ path: 'performance', version: '1' })
export class PerformanceController {
  constructor(private readonly svc: PerformanceService) {}

  @Get('dashboard')
  @RequirePermissions('dashboard:read_self')
  async getDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getDashboardData(u, query);
  }

  @Get('overview')
  @RequirePermissions('dashboard:read_self')
  async getOverview(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getOverview(u, query);
  }

  @Get('metrics')
  @RequirePermissions('dashboard:read_self')
  async getMetrics(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getMetrics(u, query);
  }

  @Get('kpis')
  @RequirePermissions('kpi_progress:read')
  async getKpis(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getKpis(u, query);
  }

  @Get('trends')
  @RequirePermissions('dashboard:read_self')
  async getTrends(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getTrends(u, query);
  }

  @Get('history')
  @RequirePermissions('dashboard:read_self')
  async getHistory(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getHistory(u, query);
  }

  @Get('coach')
  @RequirePermissions('ai:read')
  async getCoach(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getCoachAdvice(u, query);
  }

  // getVisibleUserIds() in the service already enforces scoping per role
  // (Admin: org/dept, HR: dept, Supervisor: team, Employee: self only), so
  // dashboard:read_self is sufficient here — matching every GET above it.
  // The previous dashboard:read_org requirement 403'd a regular employee
  // exporting their own performance data.
  @Post('export')
  @HttpCode(202)
  @RequirePermissions('dashboard:read_self')
  async queueExport(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: PerformanceExportDto,
  ) {
    return this.svc.queueExport(u, dto.format, {
      userId: dto.userId,
      departmentId: dto.departmentId,
      teamId: dto.teamId,
    });
  }
}
