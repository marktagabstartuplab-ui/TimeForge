import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ScrumService, ScrumBlockersQuery, ScrumMgmtQuery } from './scrum.service';
import { AuthPrincipal, CurrentUser } from '../../common/decorators';
import { CommentScrumEntryDto, ScrumQuery } from './dto';

/**
 * Daily Scrum Management dashboard — Supervisor (team scope) / Admin (org scope).
 * Distinct from ScrumController (`/scrum-entries`), which is the employee's own
 * personal daily-scrum session API.
 *
 * No @RequirePermissions here: the guard's `required.every(...)` check is AND-only,
 * but Supervisor and Admin satisfy *different* permissions (read_team vs read_org).
 * Scope resolution — and the ForbiddenException for anyone with neither — happens
 * in ScrumService.resolveScrumMgmtScope(), same convention as DashboardController.
 */
@ApiTags('Daily Scrum Management')
@ApiBearerAuth('access-token')
@Controller({ path: 'scrum', version: '1' })
export class ScrumDashboardController {
  constructor(private readonly svc: ScrumService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPI cards, submission trend, recent submissions, team status (Supervisor / Admin)' })
  dashboard(@CurrentUser() u: AuthPrincipal, @Query() query: ScrumMgmtQuery) {
    return this.svc.dashboard(u, query);
  }

  @Get('blockers')
  @ApiOperation({ summary: 'Blocker feed — open blockers by severity/recency (Supervisor / Admin)' })
  @ApiQuery({ name: 'severity', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'RESOLVED'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  blockers(@CurrentUser() u: AuthPrincipal, @Query() query: ScrumBlockersQuery) {
    return this.svc.blockers(u, query);
  }

  @Get('participation')
  @ApiOperation({ summary: 'Department participation rate over a period, default today (Supervisor / Admin)' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  participation(@CurrentUser() u: AuthPrincipal, @Query() query: ScrumMgmtQuery) {
    return this.svc.participation(u, query);
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Mon-Fri department submission-rate heatmap (Supervisor / Admin)' })
  @ApiQuery({ name: 'week', required: false, enum: ['current', 'previous'] })
  heatmap(@CurrentUser() u: AuthPrincipal, @Query() query: { week?: string }) {
    return this.svc.heatmap(u, query);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Daily submission trend over the last N days, default 14 (Supervisor / Admin)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  trends(@CurrentUser() u: AuthPrincipal, @Query() query: { days?: string }) {
    return this.svc.trends(u, query);
  }

  @Get('team')
  @ApiOperation({ summary: 'Find team scrum entries' })
  findTeamScrums(@CurrentUser() u: AuthPrincipal, @Query() query: ScrumQuery & { search?: string }) {
    return this.svc.findTeamScrums(u, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find single scrum details' })
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  @Post(':id/comment')
  @HttpCode(200)
  @ApiOperation({ summary: 'Comment on a scrum entry' })
  comment(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentScrumEntryDto,
  ) {
    return this.svc.comment(u, id, dto);
  }

  @Post(':id/flag')
  @HttpCode(200)
  @ApiOperation({ summary: 'Flag a scrum entry' })
  flag(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('version', ParseIntPipe) version: number,
  ) {
    return this.svc.flagScrumEntry(u, id, version);
  }
}
