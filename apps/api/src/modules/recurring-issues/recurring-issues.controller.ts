import { Controller, Get, Query } from '@nestjs/common';
import { RecurringIssuesService } from './recurring-issues.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { RecurringIssueQuery } from './dto';

@Controller({ path: 'recurring-issues', version: '1' })
export class RecurringIssuesController {
  constructor(private readonly svc: RecurringIssuesService) {}

  @Get()
  @RequirePermissions('scrum:read_team')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: RecurringIssueQuery) {
    return this.svc.findAll(u, query);
  }

  @Get('summary')
  @RequirePermissions('scrum:read_team')
  getSummary(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getSummary(u);
  }
}
