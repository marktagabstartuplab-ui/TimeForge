import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseFloatPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PayrollService } from './payroll.service';
import { CreatePayrollPeriodDto, ExportPayrollDto, PayrollPeriodQuery, RunActionDto, PayrollExportRequestDto, PayrollActionDto, PayrollRejectActionDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'payroll', version: '1' })
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  // -- Payroll Periods --

  @Get('periods')
  @RequirePermissions('payroll_period:read')
  findAllPeriods(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PayrollPeriodQuery,
  ) {
    return this.svc.findAllPeriods(u, query);
  }

  @Get('periods/:id')
  @RequirePermissions('payroll_period:read')
  findOnePeriod(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.findOnePeriod(u, id);
  }

  @Post('periods')
  @RequirePermissions('payroll_period:create')
  createPeriod(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: CreatePayrollPeriodDto,
  ) {
    return this.svc.createPeriod(u, dto);
  }

  /**
   * Compute payroll line items from Supervisor-approved (APPROVED/PAYROLL_READY)
   * timesheets. Idempotent on re-run (M2: Idempotency-Key required -- matches the
   * AI/Admin money-mutation pattern).
   */
  @Post('periods/:id/generate')
  @HttpCode(200)
  @RequirePermissions('payroll:generate')
  generateReport(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }
    return this.svc.generateReport(u, id, idempotencyKey.trim());
  }

  /** Lock the period -- no further edits after this. */
  @Post('periods/:id/lock')
  @HttpCode(200)
  @RequirePermissions('payroll_period:update')
  lockPeriod(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.lockPeriod(u, id);
  }

  /** Reset all timesheets and report data for this period back to DRAFT / OPEN for testing. */
  @Post('periods/:id/reset')
  @HttpCode(200)
  @RequirePermissions('payroll_period:update')
  resetPeriod(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.resetPeriodData(u, id);
  }

  /**
   * Export the payroll report (MVP: synchronous). Requires the period to be
   * LOCKED (H1) and an Idempotency-Key header (M2) for safe retries; each
   * export is written to the immutable audit log (H1).
   */
  @Post('periods/:id/export')
  @HttpCode(200)
  @RequirePermissions('payroll:export')
  exportReport(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExportPayrollDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }
    return this.svc.exportReport(u, id, dto, idempotencyKey.trim());
  }

  /** Fetch a generated report + line items. Finance/Admin only. */
  @Get('reports/:id')
  @RequirePermissions('payroll_period:read')
  findReport(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.findReport(u, id);
  }

  /** The current report for a period, if generated — null otherwise. Never regenerates. */
  @Get('periods/:id/report')
  @RequirePermissions('payroll_period:read')
  findReportByPeriod(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.findReportByPeriod(u, id);
  }

  /** Flags the discrepant (rejected-hours) line items on a report for follow-up. */
  @Post('reports/:id/flag-discrepancies')
  @HttpCode(200)
  @RequirePermissions('payroll:generate')
  flagDiscrepancies(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.flagDiscrepancies(u, id);
  }

  // -- Employee self-view (hours only, no amounts) --

  @Get('me')
  @RequirePermissions('payroll:read_self')
  getMyStatus(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getMyPayrollStatus(u);
  }

  @Get('me/payslips/:id/pdf')
  @RequirePermissions('payroll:read_self')
  async downloadPayslipPdf(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.exportPayslipPdf(u, id);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  // -- Hourly Rate Management (Finance / Admin) --

  @Get('rates/:userId')
  getRate(
    @CurrentUser() u: AuthPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const isAllowedRole = u.roles.some((r) => r === 'FINANCE' || r === 'ADMIN' || r === 'HR' || r === 'SUPERVISOR');
    if (userId !== u.userId && !isAllowedRole && !u.permissions.includes('payroll_rate:read') && !u.permissions.includes('*')) {
      throw new ForbiddenException('Missing required permission');
    }
    return this.svc.getRate(u, userId);
  }

  @Patch('rates/:userId')
  @RequirePermissions('payroll_rate:update')
  updateRate(
    @CurrentUser() u: AuthPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('rate', ParseFloatPipe) rate: number,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.updateRate(u, userId, rate, version);
  }

  // -- Payroll Oversight Endpoints --

  @Get('dashboard')
  @RequirePermissions('payroll:read')
  getDashboard(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getDashboard(u);
  }

  @Get('runs')
  @RequirePermissions('payroll_period:read')
  getRuns(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: PayrollPeriodQuery,
  ) {
    return this.svc.findAllPeriods(u, query);
  }

  @Get('distribution')
  @RequirePermissions('payroll:read')
  getDistribution(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getDistribution(u);
  }

  @Post('run')
  @HttpCode(200)
  @RequirePermissions('payroll:generate')
  async runAction(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: RunActionDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (dto.action === 'generate') {
      if (!idempotencyKey?.trim()) {
        throw new UnprocessableEntityException('Idempotency-Key header is required for generate');
      }
      return this.svc.generateReport(u, dto.periodId, idempotencyKey.trim());
    } else if (dto.action === 'approve') {
      return this.svc.lockPeriod(u, dto.periodId);
    }
    throw new UnprocessableEntityException(`Unsupported action: ${dto.action}`);
  }

  @Post('export')
  @HttpCode(200)
  @RequirePermissions('payroll:export')
  async exportReportAsync(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: PayrollExportRequestDto,
  ) {
    return this.svc.queueExport(u, dto.format, dto.periodId);
  }

  // -- Finance Payroll Processing (validate/approve/reject/send-to-bank pipeline) --

  @Get('processing/:periodId')
  @RequirePermissions('payroll:read')
  getProcessingDashboard(
    @CurrentUser() u: AuthPrincipal,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.svc.getProcessingDashboard(u, periodId);
  }

  @Get('employees')
  @RequirePermissions('payroll:read_employees')
  getPayrollEmployees(
    @CurrentUser() u: AuthPrincipal,
  ) {
    return this.svc.getPayrollEmployees(u);
  }

  @Get('audit-log')
  @RequirePermissions('payroll:read')
  getPayrollAuditLog(
    @CurrentUser() u: AuthPrincipal,
  ) {
    return this.svc.getPayrollAuditLog(u);
  }

  @Get('next-deadline')
  @RequirePermissions('payroll:read')
  getNextDeadline(
    @CurrentUser() u: AuthPrincipal,
  ) {
    return this.svc.getNextDeadline(u);
  }

  @Post('validate')
  @HttpCode(200)
  @RequirePermissions('payroll:validate')
  validatePayroll(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: PayrollActionDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }
    return this.svc.validatePayroll(u, dto.periodId, idempotencyKey.trim());
  }

  @Post('approve')
  @HttpCode(200)
  @RequirePermissions('payroll:approve')
  approvePayroll(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: PayrollActionDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }
    return this.svc.approvePayroll(u, dto.periodId, idempotencyKey.trim());
  }

  @Post('reject')
  @HttpCode(200)
  @RequirePermissions('payroll:reject')
  rejectPayroll(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: PayrollRejectActionDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }
    return this.svc.rejectPayroll(u, dto.periodId, dto.reason, idempotencyKey.trim());
  }

  @Post('send')
  @HttpCode(200)
  @RequirePermissions('payroll:send_to_bank')
  sendToBank(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: PayrollActionDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }
    return this.svc.sendToBank(u, dto.periodId, idempotencyKey.trim());
  }
}
