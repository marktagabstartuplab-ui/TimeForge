import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SessionAttachment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { UploadService } from '../storage/upload.service';
import { CreateAttachmentFileMetaDto, CreateAttachmentLinkDto } from './dto';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
  ) {}

  // ── Work session attachments ─────────────────────────────────────────────────

  async listForSession(p: AuthPrincipal, workSessionId: string): Promise<SessionAttachment[]> {
    await this.ownWorkSession(p, workSessionId);
    return this.prisma.sessionAttachment.findMany({
      where: { workSessionId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async createSessionLink(
    p: AuthPrincipal,
    workSessionId: string,
    dto: CreateAttachmentLinkDto,
  ): Promise<SessionAttachment> {
    await this.ownWorkSession(p, workSessionId);
    return this.prisma.sessionAttachment.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        workSessionId,
        type: dto.type,
        name: dto.name,
        url: dto.url,
        uploadedBy: p.userId,
      },
    });
  }

  async createSessionFile(
    p: AuthPrincipal,
    workSessionId: string,
    meta: CreateAttachmentFileMetaDto,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ): Promise<SessionAttachment> {
    await this.ownWorkSession(p, workSessionId);
    const { key } = await this.upload(file);
    return this.prisma.sessionAttachment.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        workSessionId,
        type: 'FILE',
        name: meta.name || file.originalname,
        storageKey: key,
        uploadedBy: p.userId,
      },
    });
  }

  // ── Scrum task attachments ───────────────────────────────────────────────────

  async listForTask(p: AuthPrincipal, scrumTaskId: string): Promise<SessionAttachment[]> {
    await this.ownScrumTask(p, scrumTaskId);
    return this.prisma.sessionAttachment.findMany({
      where: { scrumTaskId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async createTaskLink(
    p: AuthPrincipal,
    scrumTaskId: string,
    dto: CreateAttachmentLinkDto,
  ): Promise<SessionAttachment> {
    await this.ownScrumTask(p, scrumTaskId);
    return this.prisma.sessionAttachment.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumTaskId,
        type: dto.type,
        name: dto.name,
        url: dto.url,
        uploadedBy: p.userId,
      },
    });
  }

  async createTaskFile(
    p: AuthPrincipal,
    scrumTaskId: string,
    meta: CreateAttachmentFileMetaDto,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ): Promise<SessionAttachment> {
    await this.ownScrumTask(p, scrumTaskId);
    const { key } = await this.upload(file);
    return this.prisma.sessionAttachment.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        scrumTaskId,
        type: 'FILE',
        name: meta.name || file.originalname,
        storageKey: key,
        uploadedBy: p.userId,
      },
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async remove(p: AuthPrincipal, id: string): Promise<void> {
    const attachment = await this.prisma.sessionAttachment.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.uploadedBy !== p.userId) {
      throw new ForbiddenException('You can only remove attachments you uploaded');
    }
    await this.prisma.sessionAttachment.delete({ where: { id } });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async upload(file: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    if (file.size > MAX_FILE_BYTES) {
      throw new UnprocessableEntityException('File exceeds the 10MB limit');
    }
    return this.uploads.upload(
      {
        folder: 'scrum-attachments',
        filename: file.originalname,
        data: file.buffer,
        contentType: file.mimetype,
        size: file.size,
      },
      { maxBytes: MAX_FILE_BYTES },
    );
  }

  private async ownWorkSession(p: AuthPrincipal, workSessionId: string): Promise<void> {
    const session = await this.prisma.workSession.findFirst({
      where: { id: workSessionId, tenantId: p.tenantId, organizationId: p.organizationId },
    });
    if (!session) throw new NotFoundException('Work session not found');
    if (session.userId !== p.userId) {
      throw new ForbiddenException('You can only access your own session attachments');
    }
  }

  private async ownScrumTask(p: AuthPrincipal, scrumTaskId: string): Promise<void> {
    const task = await this.prisma.scrumTask.findFirst({
      where: { id: scrumTaskId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!task) throw new NotFoundException('Scrum task not found');
    if (task.employeeId !== p.userId) {
      throw new ForbiddenException('You can only access your own task attachments');
    }
  }
}
