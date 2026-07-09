import {
  Controller,
  Get,
  Post,
  HttpCode,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FinanceAiService, FinanceAiQuery } from './finance-ai.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'finance-ai', version: '1' })
export class FinanceAiController {
  constructor(private readonly svc: FinanceAiService) {}

  @Get('dashboard')
  @RequirePermissions('payroll:read')
  getDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: FinanceAiQuery,
  ) {
    return this.svc.getDashboard(u, query);
  }

  @Get('alerts')
  @RequirePermissions('payroll:read')
  getAlerts(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: FinanceAiQuery,
  ) {
    return this.svc.getAlerts(u, query);
  }

  @Post('alerts/:id/review')
  @HttpCode(200)
  @RequirePermissions('payroll:read')
  reviewAlert(
    @CurrentUser() u: AuthPrincipal,
    @Param('id') id: string,
  ) {
    return this.svc.reviewAlert(u, id);
  }

  @Get('forecast')
  @RequirePermissions('payroll:read')
  getForecast(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: FinanceAiQuery,
  ) {
    return this.svc.getForecast(u, query);
  }

  @Get('budget')
  @RequirePermissions('payroll:read')
  getBudget(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: FinanceAiQuery,
  ) {
    return this.svc.getBudget(u, query);
  }

  @Get('liability')
  @RequirePermissions('payroll:read')
  getLiability(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getLiability(u);
  }

  @Post('report')
  @HttpCode(200)
  @RequirePermissions('payroll:read')
  report(@CurrentUser() u: AuthPrincipal, @Query('type') type?: string) {
    return this.svc.report(u, type);
  }

  @Get('reports/:id')
  @RequirePermissions('payroll:read')
  getReport(@CurrentUser() u: AuthPrincipal, @Param('id') id: string) {
    return this.svc.getReport(u, id);
  }
}
