import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupervisorAiService } from './supervisor-ai.service';
import { SupervisorAiExportDto, SupervisorAiQuery } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Supervisor AI')
@ApiBearerAuth('access-token')
@Controller({ path: 'supervisor/ai', version: '1' })
export class SupervisorAiController {
  constructor(private readonly svc: SupervisorAiService) {}

  @Get('dashboard')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'Supervisor AI dashboard — summary cards with real team data' })
  getDashboard(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getDashboard(u, query);
  }

  @Get('leaderboard')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'Team members ranked by AI performance score' })
  getLeaderboard(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getLeaderboard(u, query);
  }

  @Get('insights')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'AI coach insights — generated coaching recommendations from real data' })
  getInsights(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getInsights(u, query);
  }

  @Get('recommendations')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'AI recommendation feed — personalized supervisor recommendations' })
  getRecommendations(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getRecommendations(u, query);
  }

  @Get('team-health')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'Team health breakdown — productivity, collaboration, attendance, quality, consistency, risk' })
  getTeamHealth(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getTeamHealth(u, query);
  }

  @Get('trends')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'Team efficiency trends — productivity, workload, tasks, focus time, velocity' })
  getTrends(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getTrends(u, query);
  }

  @Get('alerts')
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'Actionable AI alerts — performance decline, burnout risk, workload imbalance, etc.' })
  getAlerts(@CurrentUser() u: AuthPrincipal, @Query() query: SupervisorAiQuery) {
    return this.svc.getAlerts(u, query);
  }

  @Post('export')
  @HttpCode(202)
  @RequirePermissions('ai:trigger_team')
  @ApiOperation({ summary: 'Queue an export of supervisor AI data (CSV/XLSX/PDF)' })
  queueExport(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: SupervisorAiExportDto,
  ) {
    return this.svc.queueExport(u, dto);
  }
}
