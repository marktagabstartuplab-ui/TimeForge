import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { BulkApproveDto, BulkImportUsersDto, UpsertConfigDto } from './dto';
import { ApproveUserDto, RejectUserDto } from '../users/dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  // ─── Overview ─────────────────────────────────────────────────────────────

  @Get('overview')
  @RequirePermissions('org:read')
  @ApiOperation({ summary: 'Tenant snapshot: user counts, timesheet status, pending approvals, roles, KPI templates' })
  overview(@CurrentUser() u: AuthPrincipal) {
    return this.svc.overview(u.tenantId, u.organizationId);
  }

  // ─── User Overview ────────────────────────────────────────────────────────

  @Get('user-overview')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'User breakdown by status and employment type; recent joiners; pending invites' })
  userOverview(@CurrentUser() u: AuthPrincipal) {
    return this.svc.userOverview(u.tenantId);
  }

  // ─── Org Overview ─────────────────────────────────────────────────────────

  @Get('org-overview')
  @RequirePermissions('org:read')
  @ApiOperation({ summary: 'Organization details and module entity counts (departments, teams, clients, projects)' })
  orgOverview(@CurrentUser() u: AuthPrincipal) {
    return this.svc.orgOverview(u.tenantId, u.organizationId);
  }

  // ─── System Metrics ───────────────────────────────────────────────────────

  @Get('system-metrics')
  @RequirePermissions('org:read')
  @ApiOperation({ summary: 'Cross-module aggregate counts, AI usage, notifications, process stats (Admin only)' })
  systemMetrics(@CurrentUser() u: AuthPrincipal) {
    return this.svc.systemMetrics(u.tenantId);
  }

  // ─── Health Summary ───────────────────────────────────────────────────────

  @Get('health')
  @RequirePermissions('org:read')
  @ApiOperation({ summary: 'Service health: DB latency, process uptime' })
  health() {
    return this.svc.healthSummary();
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  @Get('config')
  @RequirePermissions('org:read')
  @ApiOperation({ summary: 'Read all organization settings (delegates to OrganizationService)' })
  getConfig(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getConfig(u.tenantId, u.organizationId);
  }

  @Patch('config/:key')
  @RequirePermissions('org:update')
  @ApiOperation({ summary: 'Upsert an organization setting by key (delegates to OrganizationService)' })
  @ApiParam({ name: 'key', description: 'Setting key e.g. feature.ai_enabled or payroll.currency' })
  upsertConfig(
    @CurrentUser() u: AuthPrincipal,
    @Param('key') key: string,
    @Body() dto: UpsertConfigDto,
  ) {
    return this.svc.upsertConfig(u.tenantId, u.organizationId, u.userId, key, dto.value);
  }

  // ─── Bulk user import ─────────────────────────────────────────────────────

  @Post('users/import')
  @HttpCode(200)
  @RequirePermissions('user:create')
  @ApiOperation({ summary: 'Bulk user import (max 100). Per-item 207-style result.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  bulkImportUsers(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: BulkImportUsersDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) throw new UnprocessableEntityException('Idempotency-Key header is required');
    return this.svc.bulkImportUsers(u, dto, idempotencyKey.trim());
  }

  // ─── Employee approval ────────────────────────────────────────────────────

  @Post('users/:id/approve')
  @HttpCode(200)
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Approve a PENDING employee registration — activates the account and notifies the employee.' })
  approveUser(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveUserDto,
  ) {
    return this.svc.approveUser(u, id, dto);
  }

  @Post('users/:id/reject')
  @HttpCode(200)
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Reject a PENDING employee registration — notifies the employee with an optional reason.' })
  rejectUser(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectUserDto,
  ) {
    return this.svc.rejectUser(u, id, dto);
  }

  // ─── Bulk approve ─────────────────────────────────────────────────────────

  @Post('approvals/bulk')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  @ApiOperation({ summary: 'Bulk approve timesheets (max 100). Respects state machine and no-self-approval.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  bulkApprove(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: BulkApproveDto,
    @Headers('Idempotency-Key') idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) throw new UnprocessableEntityException('Idempotency-Key header is required');
    return this.svc.bulkApprove(u, dto, idempotencyKey.trim());
  }

  // ─── Feature flags ────────────────────────────────────────────────────────

  @Get('feature-flags')
  @RequirePermissions('org:read')
  @ApiOperation({ summary: 'Feature flags from organization_settings (keys prefixed feature.*)' })
  featureFlags(@CurrentUser() u: AuthPrincipal) {
    return this.svc.featureFlags(u.tenantId);
  }
}
