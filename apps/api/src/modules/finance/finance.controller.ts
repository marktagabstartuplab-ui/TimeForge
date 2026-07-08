import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ExportDashboardDto, FinanceTrendDto } from './dto';

@Controller({ path: 'finance', version: '1' })
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Get('dashboard')
  @RequirePermissions('payroll:read')
  getDashboard(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getDashboard(u);
  }

  @Get('payroll-trends')
  @RequirePermissions('payroll:read')
  getPayrollTrends(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: FinanceTrendDto,
  ) {
    return this.svc.getPayrollTrends(u, query.period);
  }

  @Get('activity')
  @RequirePermissions('audit:read_scoped')
  getActivity(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getActivity(u);
  }

  @Get('compliance')
  @RequirePermissions('payroll:read')
  getCompliance(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getCompliance(u);
  }

  @Get('departments')
  @RequirePermissions('payroll:read')
  getDepartments(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getDepartments(u);
  }

  @Post('export')
  @HttpCode(200)
  @RequirePermissions('payroll:export')
  async exportDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: ExportDashboardDto,
  ) {
    return this.svc.exportDashboard(u, dto);
  }
}
