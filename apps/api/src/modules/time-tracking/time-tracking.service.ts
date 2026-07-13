import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, Prisma, TimeEntry } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import { CreateTimeEntryDto, StartTimerDto, UpdateTimeEntryDto, TimeEntryQuery, TimeEntryAttachment } from './dto';

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
  ) {}

  // ── Reads (own / team / org scoped) ────────────────────────────────────────

  async findAll(p: AuthPrincipal, query: TimeEntryQuery): Promise<PageResult<TimeEntry>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.TimeEntryWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(await this.resolveUserFilter(p, query.userId)),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.workCategoryId ? { workCategoryId: query.workCategoryId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.running === 'true' ? { endTime: null } : {}),
      ...(query.from || query.to
        ? {
            startTime: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.timeEntry.findMany({
      where,
      orderBy: [{ startTime: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  async findOne(p: AuthPrincipal, id: string): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.userId !== p.userId && !(await this.canViewOther(p, entry.userId))) {
      throw new ForbiddenException('Not permitted to view this entry');
    }
    return entry;
  }

  // ── Writes (own only) ───────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateTimeEntryDto): Promise<TimeEntry> {
    const start = new Date(dto.startTime);
    const end = dto.endTime ? new Date(dto.endTime) : null;
    if (end && end <= start) throw new UnprocessableEntityException('endTime must be after startTime');
    await this.validateRefs(p, dto.projectId, dto.clientId, dto.workCategoryId, dto.departmentId);
    if (!end) await this.assertNoRunningTimer(p);
    const entry = await this.prisma.timeEntry.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        source: 'MANUAL',
        startTime: start,
        endTime: end,
        durationMinutes: end ? this.minutes(start, end) : null,
        projectId: dto.projectId ?? null,
        clientId: dto.clientId ?? null,
        workCategoryId: dto.workCategoryId ?? null,
        departmentId: dto.departmentId ?? null,
        description: dto.description ?? null,
        task: dto.task ?? null,
        deliverables: dto.deliverables ?? null,
        referenceLinks: dto.referenceLinks ?? undefined,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', entry.id, { event: 'TIME_ENTRY_CREATED' });
    return entry;
  }

  async startTimer(p: AuthPrincipal, dto: StartTimerDto): Promise<TimeEntry> {
    await this.assertNoRunningTimer(p);
    await this.validateRefs(p, dto.projectId, dto.clientId, dto.workCategoryId, dto.departmentId);
    const entry = await this.prisma.timeEntry.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        source: 'TIMER',
        startTime: new Date(),
        endTime: null,
        durationMinutes: null,
        projectId: dto.projectId ?? null,
        clientId: dto.clientId ?? null,
        workCategoryId: dto.workCategoryId ?? null,
        departmentId: dto.departmentId ?? null,
        description: dto.description ?? null,
        task: dto.task ?? null,
        deliverables: dto.deliverables ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', entry.id, { event: 'TIMER_STARTED' });
    return entry;
  }

  async stopTimer(p: AuthPrincipal, id: string): Promise<TimeEntry> {
    const entry = await this.ownEntry(p, id);
    if (entry.endTime) throw new ConflictException('Timer is already stopped');
    const end = new Date();
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        endTime: end,
        durationMinutes: this.minutes(entry.startTime, end),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', id, { event: 'TIMER_STOPPED' });
    return updated;
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateTimeEntryDto): Promise<TimeEntry> {
    const entry = await this.ownEntry(p, id);
    if (entry.version !== dto.version) throw new ConflictException('Version mismatch');
    if (entry.timesheetId) throw new ConflictException('Entry is locked by a submitted timesheet');

    const start = dto.startTime ? new Date(dto.startTime) : entry.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : entry.endTime;
    if (end && end <= start) throw new UnprocessableEntityException('endTime must be after startTime');
    await this.validateRefs(p, dto.projectId, dto.clientId, dto.workCategoryId, dto.departmentId);

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        startTime: start,
        endTime: end,
        durationMinutes: end ? this.minutes(start, end) : null,
        projectId: dto.projectId ?? entry.projectId,
        clientId: dto.clientId ?? entry.clientId,
        workCategoryId: dto.workCategoryId ?? entry.workCategoryId,
        departmentId: dto.departmentId ?? entry.departmentId,
        description: dto.description ?? entry.description,
        task: dto.task ?? entry.task,
        deliverables: dto.deliverables ?? entry.deliverables,
        referenceLinks: dto.referenceLinks ?? undefined,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', id, { event: 'TIME_ENTRY_UPDATED' });
    return updated;
  }

  async remove(p: AuthPrincipal, id: string, version: number): Promise<void> {
    const entry = await this.ownEntry(p, id);
    if (entry.version !== version) throw new ConflictException('Version mismatch');
    if (entry.timesheetId) throw new ConflictException('Entry is locked by a submitted timesheet');
    await this.prisma.timeEntry.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId, version: { increment: 1 } },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', id, { event: 'TIME_ENTRY_DELETED' });
  }

  // ── Attachments ─────────────────────────────────────────────────────────────

  private readonly ALLOWED_ATTACHMENT_TYPES = [
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf',
    'text/csv', 'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json',
    'application/zip',
  ];

  private readonly MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

  async addAttachment(
    p: AuthPrincipal,
    id: string,
    version: number,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ): Promise<TimeEntry> {
    const entry = await this.ownEntry(p, id);
    if (entry.version !== version) throw new ConflictException('Version mismatch');
    if (entry.timesheetId) throw new ConflictException('Entry is locked by a submitted timesheet');

    const current: TimeEntryAttachment[] = (entry.attachments as unknown as TimeEntryAttachment[]) ?? [];

    const { key } = await this.uploads.upload(
      {
        folder: 'documents',
        filename: file.originalname,
        data: file.buffer,
        contentType: file.mimetype,
        size: file.size,
      },
      { maxBytes: this.MAX_ATTACHMENT_BYTES, allowedMimeTypes: this.ALLOWED_ATTACHMENT_TYPES },
    );

    const attachment: TimeEntryAttachment = { key, filename: file.originalname, contentType: file.mimetype, size: file.size };
    const updated = [...current, attachment];

    const result = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        attachments: updated as any,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', id, { event: 'ATTACHMENT_UPLOADED', filename: file.originalname });
    return result;
  }

  async getAttachmentSignedUrl(p: AuthPrincipal, id: string, key: string): Promise<{ url: string; filename: string }> {
    const entry = await this.findOne(p, id);
    const attachments: TimeEntryAttachment[] = (entry.attachments as unknown as TimeEntryAttachment[]) ?? [];
    const attachment = attachments.find((a) => a.key === key);
    if (!attachment) throw new NotFoundException('Attachment not found');
    const url = await this.storage.signedUrl(key);
    return { url, filename: attachment.filename };
  }

  async removeAttachment(p: AuthPrincipal, id: string, key: string, version: number): Promise<TimeEntry> {
    const entry = await this.ownEntry(p, id);
    if (entry.version !== version) throw new ConflictException('Version mismatch');
    if (entry.timesheetId) throw new ConflictException('Entry is locked by a submitted timesheet');

    const current: TimeEntryAttachment[] = (entry.attachments as unknown as TimeEntryAttachment[]) ?? [];
    const removed = current.find((a) => a.key === key);
    if (!removed) throw new NotFoundException('Attachment not found');

    const updated = current.filter((a) => a.key !== key);
    void this.storage.remove(key).catch(() => {});

    const result = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        attachments: updated as any,
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(p, AuditAction.ADMIN_ACTION, 'time_entry', id, { event: 'ATTACHMENT_REMOVED', key });
    return result;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  private async resolveUserFilter(
    p: AuthPrincipal,
    requestedUserId?: string,
  ): Promise<Prisma.TimeEntryWhereInput> {
    if (this.can(p, PERMISSIONS.TIME_ENTRY_READ_ORG)) {
      return requestedUserId ? { userId: requestedUserId } : {};
    }
    if (this.can(p, PERMISSIONS.TIME_ENTRY_READ_TEAM)) {
      const ids = await this.teamUserIds(p);
      if (requestedUserId && !ids.includes(requestedUserId)) {
        throw new ForbiddenException('That user is outside your team');
      }
      return { userId: requestedUserId ?? { in: ids } };
    }
    if (requestedUserId && requestedUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own entries');
    }
    return { userId: p.userId };
  }

  private async canViewOther(p: AuthPrincipal, ownerId: string): Promise<boolean> {
    if (this.can(p, PERMISSIONS.TIME_ENTRY_READ_ORG)) return true;
    if (this.can(p, PERMISSIONS.TIME_ENTRY_READ_TEAM)) {
      return (await this.teamUserIds(p)).includes(ownerId);
    }
    return false;
  }

  private async teamUserIds(p: AuthPrincipal): Promise<string[]> {
    const reports = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        supervisorId: p.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return [p.userId, ...reports.map((r) => r.id)];
  }

  private minutes(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  }

  private async ownEntry(p: AuthPrincipal, id: string): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.userId !== p.userId) throw new ForbiddenException('You can only modify your own entries');
    return entry;
  }

  private async assertNoRunningTimer(p: AuthPrincipal): Promise<void> {
    const running = await this.prisma.timeEntry.findFirst({
      where: { tenantId: p.tenantId, userId: p.userId, endTime: null, deletedAt: null },
    });
    if (running) throw new ConflictException('You already have a running timer');
  }

  private async audit(p: AuthPrincipal, action: AuditAction, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { tenantId: p.tenantId, actorId: p.userId, action, entityType, entityId, metadata } });
  }

  private async validateRefs(
    p: AuthPrincipal,
    projectId?: string,
    clientId?: string,
    workCategoryId?: string,
    departmentId?: string,
  ): Promise<void> {
    const scope = { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null };
    if (projectId && !(await this.prisma.project.findFirst({ where: { id: projectId, ...scope } }))) {
      throw new UnprocessableEntityException('Invalid projectId');
    }
    if (clientId && !(await this.prisma.client.findFirst({ where: { id: clientId, ...scope } }))) {
      throw new UnprocessableEntityException('Invalid clientId');
    }
    if (
      workCategoryId &&
      !(await this.prisma.workCategory.findFirst({ where: { id: workCategoryId, ...scope } }))
    ) {
      throw new UnprocessableEntityException('Invalid workCategoryId');
    }
    if (
      departmentId &&
      !(await this.prisma.department.findFirst({ where: { id: departmentId, ...scope } }))
    ) {
      throw new UnprocessableEntityException('Invalid departmentId');
    }
  }
}
