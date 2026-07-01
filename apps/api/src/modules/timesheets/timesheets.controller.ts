import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import {
  AttachEntriesDto,
  CreateTimesheetDto,
  SubmitTimesheetDto,
  TimesheetQuery,
  UpdateTimesheetDto,
} from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'timesheets', version: '1' })
export class TimesheetsController {
  constructor(private readonly svc: TimesheetsService) {}

  // -- List / detail --

  @Get()
  @RequirePermissions('timesheet:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetQuery) {
    return this.svc.findAll(u, query);
  }

  @Get(':id')
  @RequirePermissions('timesheet:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  // -- Employee lifecycle --

  @Post()
  @RequirePermissions('timesheet:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateTimesheetDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @RequirePermissions('timesheet:update')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimesheetDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('timesheet:submit')
  submit(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitTimesheetDto,
  ) {
    return this.svc.submit(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('timesheet:update')
  remove(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.remove(u, id, version);
  }

  // -- Entry management (DRAFT only) --

  @Post(':id/entries')
  @RequirePermissions('timesheet:update')
  attachEntries(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachEntriesDto,
  ) {
    return this.svc.attachEntries(u, id, dto);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(204)
  @RequirePermissions('timesheet:update')
  detachEntry(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.svc.detachEntry(u, id, entryId);
  }

  // -- Approval workflow --
  //
  // NOTE (C1 fix): the SUBMITTED|UNDER_REVIEW -> APPROVED/REJECTED/REVISION_REQUESTED
  // transition is handled EXCLUSIVELY by ApprovalsController / ApprovalsService via
  // POST /api/v1/approvals/:timesheetId/decision. That is the only code path that
  // enforces self-approval prevention (BR-APP-04), team scope (BR-APP-03), Approval
  // history, KPI updates, and (as of M1) the audit trail. Do not reintroduce a
  // second `decide` endpoint here -- it previously duplicated (and under-enforced)
  // that transition. See docs/Backend-RC-Review.md C1.

  /**
   * Finance / Admin: APPROVED -> PAYROLL_READY.
   */
  @Post(':id/payroll-ready')
  @RequirePermissions('payroll:generate')
  markPayrollReady(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.markPayrollReady(u, id);
  }
}
