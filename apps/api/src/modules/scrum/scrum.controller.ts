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
import { ScrumService } from './scrum.service';
import {
  CommentScrumEntryDto,
  CreateScrumBlockerDto,
  CreateScrumEntryDto,
  CreateScrumTaskDto,
  ScrumQuery,
  UpdateScrumBlockerDto,
  UpdateScrumEntryDto,
  UpdateScrumTaskDto,
} from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'scrum-entries', version: '1' })
export class ScrumController {
  constructor(private readonly svc: ScrumService) {}

  @Get()
  @RequirePermissions('scrum:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: ScrumQuery) {
    return this.svc.findAll(u, query);
  }

  @Get(':id')
  @RequirePermissions('scrum:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  @Post()
  @RequirePermissions('scrum:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateScrumEntryDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @RequirePermissions('scrum:update')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScrumEntryDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  /** Supervisor adds a comment to a team member's scrum entry. */
  @Post(':id/comment')
  @HttpCode(200)
  @RequirePermissions('scrum:read_team')
  comment(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentScrumEntryDto,
  ) {
    return this.svc.comment(u, id, dto);
  }

  // ── Scrum Tasks ─────────────────────────────────────────────────────────────

  @Get(':id/tasks')
  @RequirePermissions('scrum:read')
  listTasks(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listTasks(u, id);
  }

  @Post(':id/tasks')
  @RequirePermissions('scrum:create')
  createTask(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScrumTaskDto,
  ) {
    return this.svc.createTask(u, id, dto);
  }

  @Patch('tasks/:taskId')
  @RequirePermissions('scrum:update')
  updateTask(
    @CurrentUser() u: AuthPrincipal,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateScrumTaskDto,
  ) {
    return this.svc.updateTask(u, taskId, dto);
  }

  @Post('tasks/:taskId/complete')
  @HttpCode(200)
  @RequirePermissions('scrum:update')
  completeTask(
    @CurrentUser() u: AuthPrincipal,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body('version', ParseIntPipe) version: number,
  ) {
    return this.svc.completeTask(u, taskId, version);
  }

  @Delete('tasks/:taskId')
  @HttpCode(204)
  @RequirePermissions('scrum:update')
  deleteTask(
    @CurrentUser() u: AuthPrincipal,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.deleteTask(u, taskId, version);
  }

  // ── Scrum Blockers ──────────────────────────────────────────────────────────

  @Get(':id/blockers')
  @RequirePermissions('scrum:read')
  listBlockers(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listBlockers(u, id);
  }

  @Post(':id/blockers')
  @RequirePermissions('scrum:create')
  createBlocker(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScrumBlockerDto,
  ) {
    return this.svc.createBlocker(u, id, dto);
  }

  @Patch('blockers/:blockerId')
  @RequirePermissions('scrum:update')
  updateBlocker(
    @CurrentUser() u: AuthPrincipal,
    @Param('blockerId', ParseUUIDPipe) blockerId: string,
    @Body() dto: UpdateScrumBlockerDto,
  ) {
    return this.svc.updateBlocker(u, blockerId, dto);
  }

  @Post('blockers/:blockerId/resolve')
  @HttpCode(200)
  @RequirePermissions('scrum:update')
  resolveBlocker(
    @CurrentUser() u: AuthPrincipal,
    @Param('blockerId', ParseUUIDPipe) blockerId: string,
    @Body('version', ParseIntPipe) version: number,
  ) {
    return this.svc.resolveBlocker(u, blockerId, version);
  }

  @Delete('blockers/:blockerId')
  @HttpCode(204)
  @RequirePermissions('scrum:update')
  deleteBlocker(
    @CurrentUser() u: AuthPrincipal,
    @Param('blockerId', ParseUUIDPipe) blockerId: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.deleteBlocker(u, blockerId, version);
  }
}
