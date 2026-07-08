import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation } from '@nestjs/swagger';
import { TimesheetsService } from './timesheets.service';
import {
  AttachEntriesDto,
  BulkApproveTimesheetsDto,
  BulkRejectTimesheetsDto,
  CreateTimesheetDto,
  SubmitTimesheetDto,
  TimesheetChartQuery,
  TimesheetHistoryQuery,
  TimesheetQuery,
  TimesheetStatsQuery,
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

  @Get('pending')
  @RequirePermissions('timesheet:read_team')
  findPending(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetQuery) {
    return this.svc.findPending(u, query);
  }

  // -- History (My Timesheet History) --
  //
  // Registered before `:id` so "history" isn't parsed as a timesheet id.

  @Get('history')
  @RequirePermissions('timesheet:read')
  history(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetHistoryQuery) {
    return this.svc.history(u, query);
  }

  @Get('history/export')
  @RequirePermissions('timesheet:read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="timesheet-history.csv"')
  async historyExport(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: TimesheetHistoryQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.svc.historyCsv(u, query);
    res.send(csv);
  }

  // -- Timesheet Oversight (Supervisor/Admin) --
  //
  // Registered before `:id` so "stats" / "chart" aren't parsed as a timesheet id.

  @Get('stats')
  @RequirePermissions('timesheet:read')
  stats(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetStatsQuery) {
    return this.svc.stats(u, query);
  }

  @Get('chart')
  @RequirePermissions('timesheet:read')
  chart(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetChartQuery) {
    return this.svc.chart(u, query);
  }

  // ─── HR Timesheet review (read-only, org-wide) ──────────────────────────

  @Get('hr')
  @RequirePermissions('timesheet:read_org')
  hrFindAll(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetQuery) {
    return this.svc.hrFindAll(u, query);
  }

  @Get('hr/stats')
  @RequirePermissions('timesheet:read_org')
  hrStats(@CurrentUser() u: AuthPrincipal, @Query() query: TimesheetStatsQuery) {
    return this.svc.hrStats(u, query);
  }

  @Get('hr/export/csv')
  @RequirePermissions('timesheet:read_org')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="hr-timesheets.csv"')
  async hrExportCsv(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: TimesheetQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.svc.hrExportCsv(u, query);
    res.send(csv);
  }

  @Get('hr/export/excel')
  @RequirePermissions('timesheet:read_org')
  async hrExportExcel(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: TimesheetQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.hrExportExcel(u, query);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Get('hr/export/pdf')
  @RequirePermissions('timesheet:read_org')
  async hrExportPdf(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: TimesheetQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.hrExportPdf(u, query);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Get(':id')
  @RequirePermissions('timesheet:read')
  findOneDetail(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOneDetail(u, id);
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
  //
  // bulk-approve / bulk-reject below are thin loops over ApprovalsService.decide()
  // (same pattern as AdminService.bulkApprove) — they do not reimplement the
  // transition themselves, so every C1 protection still applies per item.

  @Post('bulk-approve')
  @RequirePermissions('approval:decide')
  @ApiOperation({ summary: 'Bulk-approve timesheets (max 100). Each item still enforced by ApprovalsService.decide().' })
  bulkApprove(@CurrentUser() u: AuthPrincipal, @Body() dto: BulkApproveTimesheetsDto) {
    return this.svc.bulkApprove(u, dto);
  }

  @Post('bulk-reject')
  @RequirePermissions('approval:decide')
  @ApiOperation({ summary: 'Bulk-reject timesheets (max 100), one shared remark. Each item still enforced by ApprovalsService.decide().' })
  bulkReject(@CurrentUser() u: AuthPrincipal, @Body() dto: BulkRejectTimesheetsDto) {
    return this.svc.bulkReject(u, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  approve(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { expectedVersion: number; remark?: string },
  ) {
    return this.svc.findOne(u, id).then((sheet) => {
      return this.svc['approvals'].decide(u, id, {
        action: 'APPROVE',
        expectedVersion: dto.expectedVersion,
        remark: dto.remark,
      });
    });
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  reject(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { expectedVersion: number; remark: string },
  ) {
    return this.svc.findOne(u, id).then((sheet) => {
      return this.svc['approvals'].decide(u, id, {
        action: 'REJECT',
        expectedVersion: dto.expectedVersion,
        remark: dto.remark,
      });
    });
  }

  @Post(':id/request-revision')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  requestRevision(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { expectedVersion: number; remark: string },
  ) {
    return this.svc.findOne(u, id).then((sheet) => {
      return this.svc['approvals'].decide(u, id, {
        action: 'REQUEST_REVISION',
        expectedVersion: dto.expectedVersion,
        remark: dto.remark,
      });
    });
  }

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
