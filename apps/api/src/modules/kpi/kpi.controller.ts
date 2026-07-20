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
import { KpiService } from './kpi.service';
import {
  CreateKpiTemplateDto,
  KpiProgressQuery,
  KpiTemplateQuery,
  UpdateKpiTemplateDto,
} from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'kpi', version: '1' })
export class KpiController {
  constructor(private readonly svc: KpiService) {}

  // ── Templates ───────────────────────────────────────────────────────────────

  @Get('templates')
  @RequirePermissions('kpi_template:read')
  findAllTemplates(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: KpiTemplateQuery,
  ) {
    return this.svc.findAllTemplates(u, query);
  }

  @Get('templates/:id')
  @RequirePermissions('kpi_template:read')
  findOneTemplate(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.findOneTemplate(u, id);
  }

  @Post('templates')
  @RequirePermissions('kpi_template:create')
  createTemplate(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: CreateKpiTemplateDto,
  ) {
    return this.svc.createTemplate(u, dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('kpi_template:update')
  updateTemplate(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKpiTemplateDto,
  ) {
    return this.svc.updateTemplate(u, id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @RequirePermissions('kpi_template:delete')
  removeTemplate(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.removeTemplate(u, id, version);
  }

  // ── Progress (read-only) ────────────────────────────────────────────────────

  @Get('progress')
  @RequirePermissions('kpi_progress:read')
  findProgress(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: KpiProgressQuery,
  ) {
    return this.svc.findProgress(u, query);
  }

  @Get('my-summary')
  @RequirePermissions('kpi_progress:read')
  getMyProgressSummary(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getMyProgressSummary(u);
  }

  @Post('progress/manual')
  @HttpCode(200)
  @RequirePermissions('kpi_progress:update')
  recordManualProgress(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: { kpiTemplateId: string; userId: string; currentValue: number; periodKey?: string },
  ) {
    return this.svc.recordManualProgress(u, dto);
  }

  // ── Team KPI Dashboard (Supervisor) ─────────────────────────────────────────

  @Get('team/summary')
  @RequirePermissions('kpi_progress:read_team')
  getTeamSummary(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: { quarter?: string },
  ) {
    return this.svc.getTeamSummary(u, query);
  }

  @Get('team/chart')
  @RequirePermissions('kpi_progress:read_team')
  getTeamChart(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: { quarter?: string },
  ) {
    return this.svc.getTeamChart(u, query);
  }

  @Get('team/underperforming')
  @RequirePermissions('kpi_progress:read_team')
  getUnderperformingMembers(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: { quarter?: string },
  ) {
    return this.svc.getUnderperformingMembers(u, query);
  }

  @Post('coaching')
  @HttpCode(200)
  @RequirePermissions('kpi_progress:read_team')
  submitCoaching(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: { userId: string; remarks: string },
  ) {
    return this.svc.submitCoaching(u, dto);
  }
}
