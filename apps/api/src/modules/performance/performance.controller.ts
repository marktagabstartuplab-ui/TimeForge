import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { PerformanceService, PerformanceQuery } from './performance.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

export class PerformanceExportDto {
  format!: 'CSV' | 'XLSX' | 'PDF';
  userId?: string;
  departmentId?: string;
  teamId?: string;
}

@Controller({ path: 'performance', version: '1' })
export class PerformanceController {
  constructor(private readonly svc: PerformanceService) {}

  @Get('dashboard')
  @RequirePermissions('dashboard:read_team')
  async getDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getDashboardData(u, query);
  }

  @Get('overview')
  @RequirePermissions('dashboard:read_team')
  async getOverview(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getOverview(u, query);
  }

  @Get('metrics')
  @RequirePermissions('dashboard:read_team')
  async getMetrics(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getMetrics(u, query);
  }

  @Get('kpis')
  @RequirePermissions('kpi:read_org')
  async getKpis(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getKpis(u, query);
  }

  @Get('trends')
  @RequirePermissions('dashboard:read_team')
  async getTrends(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getTrends(u, query);
  }

  @Get('history')
  @RequirePermissions('dashboard:read_team')
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

  @Post('export')
  @HttpCode(202)
  @RequirePermissions('dashboard:read_org')
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
