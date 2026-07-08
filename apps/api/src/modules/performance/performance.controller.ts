import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { PerformanceService, PerformanceQuery } from './performance.service';
import { AuthPrincipal, CurrentUser } from '../../common/decorators';

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
  async getDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getDashboardData(u, query);
  }

  @Get('overview')
  async getOverview(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getOverview(u, query);
  }

  @Get('metrics')
  async getMetrics(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getMetrics(u, query);
  }

  @Get('kpis')
  async getKpis(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getKpis(u, query);
  }

  @Get('trends')
  async getTrends(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getTrends(u, query);
  }

  @Get('history')
  async getHistory(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getHistory(u, query);
  }

  @Get('coach')
  async getCoach(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PerformanceQuery,
  ) {
    return this.svc.getCoachAdvice(u, query);
  }

  @Post('export')
  @HttpCode(202)
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
