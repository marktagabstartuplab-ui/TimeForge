import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Bug, Prisma } from '@prisma/client';
import { PERMISSIONS } from '@timeforge/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import {
  BugPriorityDto,
  BugQuery,
  BugSeverityDto,
  BugStatusDto,
  CreateBugCommentDto,
  CreateBugDto,
  UpdateBugDto,
} from './dto';

/** Terminal statuses that stamp `resolvedAt`. */
const RESOLVED_STATUSES: BugStatusDto[] = ['FIXED', 'CLOSED'];

const REPORTER_SELECT = {
  select: { id: true, firstName: true, lastName: true, email: true, avatarKey: true },
} as const;

@Injectable()
export class BugsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
    private readonly deptScope: DepartmentScopeService,
  ) {}

  private readonly ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  private readonly ATTACHMENT_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/zip',
  ];

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateBugDto): Promise<Bug> {
    const bug = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bug.create({
        data: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          title: dto.title,
          issue: dto.issue,
          whoAffected: dto.whoAffected,
          whatISee: dto.whatISee,
          expected: dto.expected,
          errorMessage: dto.errorMessage ?? null,
          whereItHappens: dto.whereItHappens,
          severity: dto.severity ?? 'P3',
          reportedBy: p.userId,
        },
      });
      await tx.bugActivityLog.create({
        data: {
          tenantId: p.tenantId,
          bugId: created.id,
          action: 'REPORTED',
          newValue: 'OPEN',
          changedBy: p.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'ADMIN_ACTION',
          entityType: 'bug',
          entityId: created.id,
          metadata: { event: 'BUG_REPORTED', title: dto.title, severity: created.severity },
        },
      });
      return created;
    });

    await this.notifyTriagers(p, bug);
    return bug;
  }

  /** In-app notice to everyone who can triage (Admins) that a new bug landed. */
  private async notifyTriagers(p: AuthPrincipal, bug: Bug): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { key: 'ADMIN' } } },
      },
      select: { id: true },
    });

    for (const admin of admins) {
      if (admin.id === p.userId) continue;
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: admin.id,
        senderId: p.userId,
        type: 'SUBMISSION',
        category: 'SYSTEM',
        title: 'New bug report',
        message: `${bug.title} — reported from ${bug.whereItHappens}.`,
        priority: bug.severity === 'P0' || bug.severity === 'P1' ? 'HIGH' : 'NORMAL',
        actionUrl: `/bugs/${bug.id}`,
        actionLabel: 'View Bug',
        metadata: { bugId: bug.id },
      });
    }
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  /**
   * Widest scope the caller is entitled to, unless they ask for a narrower one.
   * `scope=self` is always allowed; `team`/`org` need the matching permission.
   */
  private async scopeFilter(p: AuthPrincipal, query: BugQuery): Promise<Prisma.BugWhereInput> {
    const requested =
      query.scope ??
      (this.can(p, PERMISSIONS.BUG_READ_ORG) ? 'org' : this.can(p, PERMISSIONS.BUG_READ_TEAM) ? 'team' : 'self');

    if (requested === 'org') {
      if (!this.can(p, PERMISSIONS.BUG_READ_ORG)) {
        throw new ForbiddenException('You do not have org-level bug visibility');
      }
      return {};
    }
    if (requested === 'team') {
      if (!this.can(p, PERMISSIONS.BUG_READ_TEAM)) {
        throw new ForbiddenException('You do not have team-level bug visibility');
      }
      return { reportedBy: { in: await this.deptScope.teamUserIds(p) } };
    }
    // Own reports, plus anything assigned to them.
    return { OR: [{ reportedBy: p.userId }, { assignedTo: p.userId }] };
  }

  async findMany(p: AuthPrincipal, query: BugQuery): Promise<PageResult<Bug>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const scope = await this.scopeFilter(p, query);

    const where: Prisma.BugWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...scope,
      ...(query.status ? { status: query.status as BugStatusDto } : {}),
      ...(query.priority ? { priority: query.priority as BugPriorityDto } : {}),
      ...(query.severity ? { severity: query.severity as BugSeverityDto } : {}),
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
      ...(query.reportedBy ? { reportedBy: query.reportedBy } : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: query.search, mode: 'insensitive' as const } },
                  { issue: { contains: query.search, mode: 'insensitive' as const } },
                  { whereItHappens: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            ],
          }
        : {}),
    };

    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.bug.findMany({
      where,
      include: {
        reporter: REPORTER_SELECT,
        assignee: REPORTER_SELECT,
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return buildPage(items, limit);
  }

  async findOne(p: AuthPrincipal, id: string) {
    const bug = await this.prisma.bug.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        reporter: REPORTER_SELECT,
        assignee: REPORTER_SELECT,
        attachments: { orderBy: { createdAt: 'asc' } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { user: REPORTER_SELECT },
        },
      },
    });
    if (!bug) throw new NotFoundException('Bug not found');
    await this.assertCanView(p, bug);
    return bug;
  }

  async getActivity(p: AuthPrincipal, id: string) {
    await this.findOneRaw(p, id); // enforces visibility
    return this.prisma.bugActivityLog.findMany({
      where: { tenantId: p.tenantId, bugId: id },
      include: { actor: REPORTER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Counters for the triage dashboard, within the caller's visible scope. */
  async getStats(p: AuthPrincipal) {
    const scope = await this.scopeFilter(p, {});
    const base: Prisma.BugWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...scope,
    };

    const [total, open, inProgress, fixed, closed, blocked, critical, unassigned] = await Promise.all([
      this.prisma.bug.count({ where: base }),
      this.prisma.bug.count({ where: { ...base, status: 'OPEN' } }),
      this.prisma.bug.count({ where: { ...base, status: 'IN_PROGRESS' } }),
      this.prisma.bug.count({ where: { ...base, status: 'FIXED' } }),
      this.prisma.bug.count({ where: { ...base, status: 'CLOSED' } }),
      this.prisma.bug.count({ where: { ...base, status: 'BLOCKED' } }),
      this.prisma.bug.count({ where: { ...base, priority: 'CRITICAL', status: { notIn: ['FIXED', 'CLOSED'] } } }),
      this.prisma.bug.count({ where: { ...base, assignedTo: null, status: { notIn: ['FIXED', 'CLOSED'] } } }),
    ]);

    return { total, open, inProgress, fixed, closed, blocked, critical, unassigned };
  }

  private async findOneRaw(p: AuthPrincipal, id: string): Promise<Bug> {
    const bug = await this.prisma.bug.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!bug) throw new NotFoundException('Bug not found');
    await this.assertCanView(p, bug);
    return bug;
  }

  private async assertCanView(p: AuthPrincipal, bug: Bug): Promise<void> {
    if (bug.reportedBy === p.userId || bug.assignedTo === p.userId) return;
    if (this.can(p, PERMISSIONS.BUG_READ_ORG)) return;
    if (this.can(p, PERMISSIONS.BUG_READ_TEAM)) {
      if ((await this.deptScope.teamUserIds(p)).includes(bug.reportedBy)) return;
    }
    throw new ForbiddenException('You do not have access to this bug report');
  }

  // ── Triage update (bug:update) ──────────────────────────────────────────

  async update(p: AuthPrincipal, id: string, dto: UpdateBugDto): Promise<Bug> {
    const bug = await this.prisma.bug.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!bug) throw new NotFoundException('Bug not found');

    // An assignee must be a real member of this organization.
    if (dto.assignedTo) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedTo,
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!assignee) throw new NotFoundException('Assignee not found in this organization');
    }

    const changes: { action: string; oldValue: string | null; newValue: string | null }[] = [];
    const data: Prisma.BugUpdateInput = { version: { increment: 1 } };

    if (dto.status && dto.status !== bug.status) {
      data.status = dto.status;
      changes.push({ action: 'STATUS_CHANGED', oldValue: bug.status, newValue: dto.status });
      // resolvedAt tracks the first time a bug reached a terminal state, and is
      // cleared when it is reopened, so "time to fix" stays meaningful.
      data.resolvedAt = RESOLVED_STATUSES.includes(dto.status) ? new Date() : null;
    }
    if (dto.priority && dto.priority !== bug.priority) {
      data.priority = dto.priority;
      changes.push({ action: 'PRIORITY_CHANGED', oldValue: bug.priority, newValue: dto.priority });
    }
    if (dto.severity && dto.severity !== bug.severity) {
      data.severity = dto.severity;
      changes.push({ action: 'SEVERITY_CHANGED', oldValue: bug.severity, newValue: dto.severity });
    }
    if (dto.assignedTo !== undefined && dto.assignedTo !== bug.assignedTo) {
      data.assignee = dto.assignedTo ? { connect: { id: dto.assignedTo } } : { disconnect: true };
      changes.push({ action: 'ASSIGNED', oldValue: bug.assignedTo, newValue: dto.assignedTo ?? null });
    }

    if (changes.length === 0) return bug;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.bug.update({ where: { id }, data });
      await tx.bugActivityLog.createMany({
        data: changes.map((c) => ({
          tenantId: p.tenantId,
          bugId: id,
          action: c.action,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedBy: p.userId,
        })),
      });
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'ADMIN_ACTION',
          entityType: 'bug',
          entityId: id,
          metadata: { event: 'BUG_TRIAGED', changes },
        },
      });
      return res;
    });

    await this.notifyOnUpdate(p, updated, changes);
    return updated;
  }

  private async notifyOnUpdate(
    p: AuthPrincipal,
    bug: Bug,
    changes: { action: string; newValue: string | null }[],
  ): Promise<void> {
    const assigned = changes.find((c) => c.action === 'ASSIGNED');
    // EMAIL so the assignee is reached outside the app — the notifications
    // worker also mirrors it in-app.
    if (assigned?.newValue && assigned.newValue !== p.userId) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: assigned.newValue,
        senderId: p.userId,
        type: 'SUBMISSION',
        category: 'SYSTEM',
        title: 'A bug was assigned to you',
        message: `${bug.title} (${bug.priority} / ${bug.severity}) is now assigned to you.`,
        priority: bug.priority === 'CRITICAL' ? 'HIGH' : 'NORMAL',
        actionUrl: `/bugs/${bug.id}`,
        actionLabel: 'View Bug',
        channel: 'EMAIL',
        metadata: { bugId: bug.id },
      });
    }

    const statusChange = changes.find((c) => c.action === 'STATUS_CHANGED');
    if (statusChange && bug.reportedBy !== p.userId) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: bug.reportedBy,
        senderId: p.userId,
        type: 'APPROVAL_DECISION',
        category: 'SYSTEM',
        title: 'Your bug report was updated',
        message: `${bug.title} is now ${statusChange.newValue}.`,
        priority: 'NORMAL',
        actionUrl: `/bugs/${bug.id}`,
        actionLabel: 'View Bug',
        metadata: { bugId: bug.id },
      });
    }
  }

  // ── Delete (bug:delete) ─────────────────────────────────────────────────

  /**
   * Hard delete — comments, attachments and activity cascade at the DB level,
   * matching the spec's "deleting a bug cascades" requirement. Stored files are
   * removed best-effort first so the bucket doesn't accumulate orphans, and the
   * bug's notifications are swept explicitly (see below).
   */
  async remove(
    p: AuthPrincipal,
    id: string,
  ): Promise<{ id: string; deleted: true; notificationsRemoved: number }> {
    const bug = await this.prisma.bug.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: { attachments: { select: { storageKey: true } } },
    });
    if (!bug) throw new NotFoundException('Bug not found');

    for (const a of bug.attachments) {
      void this.storage.remove(a.storageKey).catch(() => {});
    }

    const removed = await this.prisma.$transaction(async (tx) => {
      // Notification has no FK to Bug — it only references the bug through
      // `metadata.bugId` — so the DB cascade can't reach these rows. Without
      // this sweep every notice the bug generated survives it, and its
      // actionUrl (/bugs/:id) lands the user on a dead page.
      const { count } = await tx.notification.deleteMany({
        where: { tenantId: p.tenantId, metadata: { path: ['bugId'], equals: id } },
      });

      await tx.bug.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'ADMIN_ACTION',
          entityType: 'bug',
          entityId: id,
          metadata: { event: 'BUG_DELETED', title: bug.title, notificationsRemoved: count },
        },
      });
      return count;
    });

    return { id, deleted: true, notificationsRemoved: removed };
  }

  // ── Comments ────────────────────────────────────────────────────────────

  async addComment(p: AuthPrincipal, id: string, dto: CreateBugCommentDto) {
    const bug = await this.findOneRaw(p, id);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bugComment.create({
        data: { tenantId: p.tenantId, bugId: id, userId: p.userId, comment: dto.comment },
        include: { user: REPORTER_SELECT },
      });
      await tx.bugActivityLog.create({
        data: {
          tenantId: p.tenantId,
          bugId: id,
          action: 'COMMENTED',
          changedBy: p.userId,
        },
      });
      return created;
    });

    // Keep the reporter and assignee in the loop, minus whoever commented.
    const recipients = new Set([bug.reportedBy, bug.assignedTo].filter(Boolean) as string[]);
    recipients.delete(p.userId);
    for (const userId of recipients) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId,
        senderId: p.userId,
        type: 'SUBMISSION',
        category: 'SYSTEM',
        title: 'New comment on a bug',
        message: `A comment was added to "${bug.title}".`,
        priority: 'LOW',
        actionUrl: `/bugs/${bug.id}`,
        actionLabel: 'View Bug',
        metadata: { bugId: bug.id },
      });
    }

    return comment;
  }

  // ── Attachments ─────────────────────────────────────────────────────────

  async addAttachment(
    p: AuthPrincipal,
    id: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ) {
    await this.findOneRaw(p, id); // enforces visibility

    const { key } = await this.uploads.upload(
      {
        folder: 'documents',
        filename: file.originalname,
        data: file.buffer,
        contentType: file.mimetype,
        size: file.size,
      },
      { maxBytes: this.ATTACHMENT_MAX_BYTES, allowedMimeTypes: this.ATTACHMENT_TYPES },
    );

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.bugAttachment.create({
        data: {
          tenantId: p.tenantId,
          bugId: id,
          storageKey: key,
          fileName: file.originalname.slice(-255),
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedBy: p.userId,
        },
      });
      await tx.bugActivityLog.create({
        data: {
          tenantId: p.tenantId,
          bugId: id,
          action: 'ATTACHMENT_ADDED',
          newValue: created.fileName.slice(0, 255),
          changedBy: p.userId,
        },
      });
      return created;
    });
  }

  /** Short-lived download URL for anyone who can view the bug. */
  async getAttachmentUrl(p: AuthPrincipal, id: string, attachmentId: string): Promise<{ url: string }> {
    await this.findOneRaw(p, id);
    const attachment = await this.prisma.bugAttachment.findFirst({
      where: { id: attachmentId, bugId: id, tenantId: p.tenantId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return { url: await this.storage.signedUrl(attachment.storageKey) };
  }

  /** Uploader removes their own file; `bug:update` holders may remove any. */
  async removeAttachment(p: AuthPrincipal, id: string, attachmentId: string) {
    await this.findOneRaw(p, id);
    const attachment = await this.prisma.bugAttachment.findFirst({
      where: { id: attachmentId, bugId: id, tenantId: p.tenantId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.uploadedBy !== p.userId && !this.can(p, PERMISSIONS.BUG_UPDATE)) {
      throw new ForbiddenException('You can only remove attachments you uploaded');
    }

    void this.storage.remove(attachment.storageKey).catch(() => {});
    await this.prisma.bugAttachment.delete({ where: { id: attachmentId } });
    return { id: attachmentId, deleted: true as const };
  }
}
