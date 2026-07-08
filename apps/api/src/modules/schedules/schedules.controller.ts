import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SchedulesService } from './schedules.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { CreateShiftDto, ScheduleCalendarQuery, ScheduleQuery, UpdateShiftDto } from './dto';

@ApiTags('Schedules')
@ApiBearerAuth('access-token')
@Controller({ path: 'schedules', version: '1' })
export class SchedulesController {
  constructor(private readonly svc: SchedulesService) {}

  @Get()
  @RequirePermissions('schedule:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: ScheduleQuery) {
    return this.svc.findAll(u, query);
  }

  @Get('calendar')
  @RequirePermissions('schedule:read')
  getCalendar(@CurrentUser() u: AuthPrincipal, @Query() query: ScheduleCalendarQuery) {
    return this.svc.getCalendar(u, query);
  }

  @Get('conflicts')
  @RequirePermissions('schedule:read_team')
  getConflicts(@CurrentUser() u: AuthPrincipal, @Query() query: ScheduleQuery) {
    return this.svc.getConflicts(u, query);
  }

  @Get('requests')
  @RequirePermissions('schedule:read_team')
  getRequests(@CurrentUser() u: AuthPrincipal, @Query() query: ScheduleQuery) {
    return this.svc.getRequests(u, query);
  }

  @Post()
  @RequirePermissions('schedule:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateShiftDto) {
    return this.svc.create(u, dto);
  }

  @Post('draft')
  @RequirePermissions('schedule:create')
  createDraft(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateShiftDto) {
    return this.svc.createDraft(u, dto);
  }

  @Patch(':id')
  @RequirePermissions('schedule:update')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('schedule:delete')
  remove(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.remove(u, id, version);
  }
}
