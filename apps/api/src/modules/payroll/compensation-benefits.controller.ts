import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CompensationBenefitsService } from './compensation-benefits.service';
import { AssignDeMinimisDto, DeMinimisQuery, ThirteenthMonthQuery } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

/**
 * BUG-BC — HR/Finance view over 13th-month accrual and de minimis allowances.
 * Kept on its own path so nothing here shares a route prefix (or a guard) with
 * the payroll run endpoints.
 */
@Controller({ path: 'compensation', version: '1' })
export class CompensationBenefitsController {
  constructor(private readonly svc: CompensationBenefitsService) {}

  @Get('thirteenth-month')
  @RequirePermissions('compensation:read')
  getThirteenthMonth(@CurrentUser() u: AuthPrincipal, @Query() query: ThirteenthMonthQuery) {
    return this.svc.getThirteenthMonthTracker(u, query);
  }

  @Get('de-minimis/catalog')
  @RequirePermissions('compensation:read')
  getCatalog() {
    return this.svc.getDeMinimisCatalog();
  }

  @Get('de-minimis')
  @RequirePermissions('compensation:read')
  listDeMinimis(@CurrentUser() u: AuthPrincipal, @Query() query: DeMinimisQuery) {
    return this.svc.listDeMinimis(u, query.employeeId);
  }

  @Post('de-minimis')
  @RequirePermissions('compensation:manage')
  assignDeMinimis(@CurrentUser() u: AuthPrincipal, @Body() dto: AssignDeMinimisDto) {
    return this.svc.assignDeMinimis(u, dto);
  }

  @Delete('de-minimis/:id')
  @RequirePermissions('compensation:manage')
  removeDeMinimis(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeDeMinimis(u, id);
  }
}
