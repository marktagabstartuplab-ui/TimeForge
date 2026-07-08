import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { AddRemarkDto, ApprovalQueue, DecisionDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { UsersService } from '../users/users.service';
import { ApproveUserDto, PendingAccountsQuery, RejectUserDto } from '../users/dto';

@Controller({ path: 'approvals', version: '1' })
export class ApprovalsController {
  constructor(
    private readonly svc: ApprovalsService,
    private readonly users: UsersService,
  ) {}

  // ── Pending Account Approvals (registered before :timesheetId so "accounts"
  //    isn't parsed as a timesheet id) ──────────────────────────────────────

  @Get('accounts')
  @RequirePermissions('user:update')
  findPendingAccounts(@CurrentUser() u: AuthPrincipal, @Query() query: PendingAccountsQuery) {
    return this.users.listPendingAccounts(u, query);
  }

  @Post('accounts/:id/approve')
  @HttpCode(200)
  @RequirePermissions('user:update')
  approveAccount(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveUserDto) {
    return this.users.approve(u, id, dto);
  }

  @Post('accounts/:id/reject')
  @HttpCode(200)
  @RequirePermissions('user:update')
  rejectAccount(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectUserDto) {
    return this.users.reject(u, id, dto);
  }

  /** Supervisor / Admin: list the review queue for their team / org. */
  @Get()
  @RequirePermissions('approval:read_team')
  findQueue(@CurrentUser() u: AuthPrincipal, @Query() query: ApprovalQueue) {
    return this.svc.findQueue(u, query);
  }

  /** Supervisor / Admin: get one timesheet + its full approval history. */
  @Get(':timesheetId')
  @RequirePermissions('approval:read_team')
  findDetail(
    @CurrentUser() u: AuthPrincipal,
    @Param('timesheetId', ParseUUIDPipe) timesheetId: string,
  ) {
    return this.svc.findDetail(u, timesheetId);
  }

  /**
   * Supervisor / Admin: SUBMITTED | UNDER_REVIEW → APPROVED | REJECTED | REVISION_REQUESTED.
   * Idempotency-Key recommended for safe retries.
   */
  @Post(':timesheetId/decision')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  decide(
    @CurrentUser() u: AuthPrincipal,
    @Param('timesheetId', ParseUUIDPipe) timesheetId: string,
    @Body() dto: DecisionDto,
  ) {
    return this.svc.decide(u, timesheetId, dto);
  }

  /** Supervisor / Admin: add a permanent coaching remark without changing state. */
  @Post(':timesheetId/remarks')
  @RequirePermissions('approval:remark')
  addRemark(
    @CurrentUser() u: AuthPrincipal,
    @Param('timesheetId', ParseUUIDPipe) timesheetId: string,
    @Body() dto: AddRemarkDto,
  ) {
    return this.svc.addRemark(u, timesheetId, dto);
  }
}
