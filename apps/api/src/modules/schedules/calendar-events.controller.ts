import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CalendarEventsService } from './calendar-events.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import {
  CalendarEventQuery,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './calendar-events.dto';

@ApiTags('Calendar Events')
@ApiBearerAuth('access-token')
@Controller({ path: 'calendar-events', version: '1' })
export class CalendarEventsController {
  constructor(private readonly svc: CalendarEventsService) {}

  /** List the calling employee's own calendar events for a date range. */
  @Get()
  @RequirePermissions('schedule:read')
  findAll(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: CalendarEventQuery,
  ) {
    return this.svc.findAll(u, query);
  }

  /** Create a personal calendar event (scoped to the caller). */
  @Post()
  @RequirePermissions('schedule:read')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateCalendarEventDto) {
    return this.svc.create(u, dto);
  }

  /** Update an existing personal calendar event (caller must own it). */
  @Patch(':id')
  @RequirePermissions('schedule:read')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  /** Soft-delete a personal calendar event (caller must own it). */
  @Delete(':id')
  @RequirePermissions('schedule:read')
  remove(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.remove(u, id, version);
  }
}
