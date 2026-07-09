import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkSessionsService } from './work-sessions.service';
import { ClockInDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Work Sessions')
@ApiBearerAuth()
@Controller({ path: 'work-sessions', version: '1' })
export class WorkSessionsController {
  constructor(private readonly svc: WorkSessionsService) {}

  @Get('current')
  @RequirePermissions('time_entry:read')
  current(@CurrentUser() u: AuthPrincipal) {
    return this.svc.current(u);
  }

  @Post('clock-in')
  @RequirePermissions('time_entry:create')
  clockIn(@CurrentUser() u: AuthPrincipal, @Body() dto: ClockInDto) {
    return this.svc.clockIn(u, dto);
  }

  @Post('break/start')
  @HttpCode(200)
  @RequirePermissions('time_entry:update')
  breakStart(@CurrentUser() u: AuthPrincipal) {
    return this.svc.breakStart(u);
  }

  @Post('break/end')
  @HttpCode(200)
  @RequirePermissions('time_entry:update')
  breakEnd(@CurrentUser() u: AuthPrincipal) {
    return this.svc.breakEnd(u);
  }

  @Post('clock-out')
  @HttpCode(200)
  @RequirePermissions('time_entry:update')
  clockOut(@CurrentUser() u: AuthPrincipal) {
    return this.svc.clockOut(u);
  }

  @Get(':id/events')
  @RequirePermissions('time_entry:read')
  events(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.events(u, id);
  }
}
