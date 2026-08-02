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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BugsService } from './bugs.service';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';
import { BugQuery, CreateBugCommentDto, CreateBugDto, UpdateBugDto } from './dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface UploadedMulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller({ path: 'bugs', version: '1' })
export class BugsController {
  constructor(private readonly svc: BugsService) {}

  @Post()
  @RequirePermissions('bug:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateBugDto) {
    return this.svc.create(u, dto);
  }

  @Get()
  @RequirePermissions('bug:read')
  findMany(@CurrentUser() u: AuthPrincipal, @Query() query: BugQuery) {
    return this.svc.findMany(u, query);
  }

  // Declared before ':id' so "stats" is never parsed as a bug id.
  @Get('stats')
  @RequirePermissions('bug:read')
  getStats(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getStats(u);
  }

  @Get(':id')
  @RequirePermissions('bug:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  @Get(':id/activity')
  @RequirePermissions('bug:read')
  getActivity(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getActivity(u, id);
  }

  @Patch(':id')
  @RequirePermissions('bug:update')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBugDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('bug:delete')
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(u, id);
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  @Post(':id/comments')
  @RequirePermissions('bug:comment')
  addComment(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBugCommentDto,
  ) {
    return this.svc.addComment(u, id, dto);
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  @Post(':id/attachments')
  @RequirePermissions('bug:create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  addAttachment(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedMulterFile,
  ) {
    return this.svc.addAttachment(u, id, file);
  }

  @Get(':id/attachments/:attachmentId/signed-url')
  @RequirePermissions('bug:read')
  getAttachmentUrl(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.svc.getAttachmentUrl(u, id, attachmentId);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('bug:create')
  removeAttachment(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.svc.removeAttachment(u, id, attachmentId);
  }
}
