import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { CreateAnnouncementDto, ListNotificationsQueryDto } from './dto';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('notification:read_self')
  @ApiOperation({ summary: 'List own notifications (paginated, filterable, searchable, sortable)' })
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: ListNotificationsQueryDto) {
    return this.svc.findAll(u.tenantId, u.userId, query);
  }

  // ─── Unread count ────────────────────────────────────────────────────────

  @Get('unread-count')
  @RequirePermissions('notification:read_self')
  @ApiOperation({ summary: 'Get the unread notification count' })
  @ApiOkResponse({ schema: { example: { unread: 5 } } })
  unreadCount(@CurrentUser() u: AuthPrincipal) {
    return this.svc.unreadCount(u.tenantId, u.userId);
  }

  // ─── Mark one read ───────────────────────────────────────────────────────

  @Patch(':id/read')
  @RequirePermissions('notification:update_self')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markRead(u.tenantId, u.userId, id);
  }

  // ─── Mark all read ───────────────────────────────────────────────────────

  @Patch('read-all')
  @RequirePermissions('notification:update_self')
  @ApiOperation({ summary: 'Mark all own notifications as read' })
  markAllRead(@CurrentUser() u: AuthPrincipal) {
    return this.svc.markAllRead(u.tenantId, u.userId);
  }

  // ─── Archive ─────────────────────────────────────────────────────────────

  @Patch(':id/archive')
  @RequirePermissions('notification:update_self')
  @ApiOperation({ summary: 'Archive a notification' })
  archive(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.archive(u.tenantId, u.userId, id);
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('notification:update_self')
  @ApiOperation({ summary: 'Delete a notification' })
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(u.tenantId, u.userId, id);
  }

  // ─── Admin: org-wide announcement ────────────────────────────────────────

  @Post()
  @HttpCode(201)
  @RequirePermissions('notification:create_org')
  @ApiOperation({ summary: 'Broadcast an announcement to every active user in the organization (admin only)' })
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateAnnouncementDto) {
    return this.svc.createAnnouncement(u, dto);
  }
}
