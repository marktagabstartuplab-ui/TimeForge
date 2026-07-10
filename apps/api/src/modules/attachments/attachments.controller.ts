import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentFileMetaDto, CreateAttachmentLinkDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadedMulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller({ version: '1' })
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  // ── Work session attachments ─────────────────────────────────────────────────

  @Get('work-sessions/:id/attachments')
  @RequirePermissions('time_entry:read')
  listForSession(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listForSession(u, id);
  }

  @Post('work-sessions/:id/attachments')
  @RequirePermissions('time_entry:update')
  createSessionLink(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttachmentLinkDto,
  ) {
    return this.svc.createSessionLink(u, id, dto);
  }

  @Post('work-sessions/:id/attachments/file')
  @RequirePermissions('time_entry:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  createSessionFile(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() meta: CreateAttachmentFileMetaDto,
    @UploadedFile() file: UploadedMulterFile,
  ) {
    return this.svc.createSessionFile(u, id, meta, file);
  }

  // ── Scrum task attachments ───────────────────────────────────────────────────

  @Get('scrum-entries/tasks/:id/attachments')
  @RequirePermissions('scrum:read')
  listForTask(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listForTask(u, id);
  }

  @Post('scrum-entries/tasks/:id/attachments')
  @RequirePermissions('scrum:update')
  createTaskLink(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttachmentLinkDto,
  ) {
    return this.svc.createTaskLink(u, id, dto);
  }

  @Post('scrum-entries/tasks/:id/attachments/file')
  @RequirePermissions('scrum:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  createTaskFile(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() meta: CreateAttachmentFileMetaDto,
    @UploadedFile() file: UploadedMulterFile,
  ) {
    return this.svc.createTaskFile(u, id, meta, file);
  }

  // ── Delete (generic) ─────────────────────────────────────────────────────────

  @Delete('attachments/:id')
  @HttpCode(204)
  @RequirePermissions('time_entry:update')
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(u, id);
  }
}
