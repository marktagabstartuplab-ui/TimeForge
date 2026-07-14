import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto, LeaveDecisionDto, LeaveRequestQuery } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface UploadedMulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller({ path: 'leave', version: '1' })
export class LeaveController {
  constructor(private readonly svc: LeaveService) {}

  @Post('requests')
  @RequirePermissions('leave_request:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateLeaveRequestDto) {
    return this.svc.create(u, dto);
  }

  @Get('requests')
  @RequirePermissions('leave_request:read')
  findMany(@CurrentUser() u: AuthPrincipal, @Query() query: LeaveRequestQuery) {
    return this.svc.findMany(u, query);
  }

  @Get('requests/:id')
  @RequirePermissions('leave_request:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('leave_request:cancel')
  cancel(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(u, id);
  }

  @Post('requests/:id/decision')
  @HttpCode(200)
  @RequirePermissions('leave_request:decide')
  decide(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveDecisionDto,
  ) {
    return this.svc.decide(u, id, dto);
  }

  @Get('balances')
  @RequirePermissions('leave_balance:read')
  getBalances(@CurrentUser() u: AuthPrincipal, @Query('userId') userId?: string) {
    return this.svc.getBalances(u, userId);
  }

  // ── Attachment (single file per request) ─────────────────────────────────

  @Post('requests/:id/attachment')
  @RequirePermissions('leave_request:create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  uploadAttachment(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedMulterFile,
  ) {
    return this.svc.uploadAttachment(u, id, file);
  }

  @Get('requests/:id/attachment/signed-url')
  @RequirePermissions('leave_request:read')
  getAttachmentSignedUrl(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getAttachmentSignedUrl(u, id);
  }

  @Delete('requests/:id/attachment')
  @RequirePermissions('leave_request:create')
  removeAttachment(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeAttachment(u, id);
  }
}
