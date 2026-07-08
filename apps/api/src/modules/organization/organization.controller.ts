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
  Put,
  Query,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { UpdateOrgDto, UpsertSettingDto, CreateHolidayDto, ExportOrgStructureDto } from './dto';
import { CurrentUser, AuthPrincipal, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'organization', version: '1' })
export class OrganizationController {
  constructor(private readonly svc: OrganizationService) {}

  // ── Organizational Management dashboard ─────────────────────────────────────

  @Get('dashboard')
  @RequirePermissions('org:read_dashboard')
  getDashboard(@CurrentUser() user: AuthPrincipal) {
    return this.svc.getDashboard(user.tenantId, user.organizationId);
  }

  @Get('hierarchy')
  @RequirePermissions('org:read_dashboard')
  getHierarchy(@CurrentUser() user: AuthPrincipal) {
    return this.svc.getHierarchy(user.tenantId, user.organizationId);
  }

  @Get('analytics')
  @RequirePermissions('org:read_dashboard')
  getAnalytics(@CurrentUser() user: AuthPrincipal) {
    return this.svc.getAnalytics(user.tenantId, user.organizationId);
  }

  @Post('export')
  @RequirePermissions('org:read_dashboard')
  exportStructure(@CurrentUser() user: AuthPrincipal, @Body() dto: ExportOrgStructureDto) {
    return this.svc.exportStructure(user, dto);
  }

  // ── Profile ──────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('org:read')
  getOrg(@CurrentUser() user: AuthPrincipal) {
    return this.svc.getOrg(user.tenantId, user.organizationId);
  }

  @Patch()
  @RequirePermissions('org:update')
  updateOrg(@CurrentUser() user: AuthPrincipal, @Body() dto: UpdateOrgDto) {
    return this.svc.updateOrg(user.tenantId, user.organizationId, user.userId, dto);
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  @Get('settings')
  @RequirePermissions('org_settings:read')
  getSettings(@CurrentUser() user: AuthPrincipal) {
    return this.svc.getSettings(user.tenantId, user.organizationId);
  }

  @Put('settings/:key')
  @RequirePermissions('org_settings:update')
  upsertSetting(
    @CurrentUser() user: AuthPrincipal,
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
  ) {
    return this.svc.upsertSetting(user.tenantId, user.organizationId, user.userId, key, dto.value, dto.type);
  }

  // ── Holidays ─────────────────────────────────────────────────────────────────

  @Get('holidays')
  @RequirePermissions('holiday:read')
  getHolidays(@CurrentUser() user: AuthPrincipal) {
    return this.svc.getHolidays(user.tenantId, user.organizationId);
  }

  @Post('holidays')
  @RequirePermissions('holiday:write')
  createHoliday(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateHolidayDto) {
    return this.svc.createHoliday(user.tenantId, user.organizationId, user.userId, dto);
  }

  @Delete('holidays/:id')
  @HttpCode(204)
  @RequirePermissions('holiday:write')
  removeHoliday(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.removeHoliday(user.tenantId, user.organizationId, user.userId, id, version);
  }
}
