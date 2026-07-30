import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LeaveRequest, LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { PERMISSIONS, DEFAULT_TIME_ZONE, startOfOrgDay } from '@timeforge/shared';
import { OrgTimeZoneService } from '../../common/time/org-time-zone.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../storage/upload.service';
import { StorageService, withAvatarUrl } from '../storage/storage.service';
import { CreateLeaveRequestDto, LeaveDecisionDto, LeaveRequestQuery } from './dto';

/** Default annual allocation per type, used to lazily provision a balance row on first read. */
const DEFAULT_ALLOCATIONS: Record<LeaveType, number> = {
  ANNUAL: 15,
  SICK: 10,
  PERSONAL: 5,
};

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
    private readonly deptScope: DepartmentScopeService,
    private readonly timeZones: OrgTimeZoneService,
  ) {}

  private readonly ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  private readonly ATTACHMENT_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  /** Inclusive business-day count between two dates (Mon-Fri only). */
  private computeDays(start: Date, end: Date): number {
    let days = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) days += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }

  /** Department-based supervision scope (Department.managerId). */
  private teamUserIds(p: AuthPrincipal): Promise<string[]> {
    return this.deptScope.teamUserIds(p);
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(p: AuthPrincipal, dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new UnprocessableEntityException('endDate must be on or after startDate');
    }
    const days = this.computeDays(start, end);
    if (days <= 0) {
      throw new UnprocessableEntityException('The selected range contains no business days');
    }

    // No overlapping pending/approved request for this user.
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        tenantId: p.tenantId,
        userId: p.userId,
        status: { in: ['PENDING', 'APPROVED'] },
        deletedAt: null,
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap) {
      throw new ConflictException('You already have a pending or approved leave request that overlaps these dates');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          userId: p.userId,
          type: dto.type,
          startDate: start,
          endDate: end,
          days,
          reason: dto.reason,
          status: 'PENDING',
          createdBy: p.userId,
          updatedBy: p.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'ADMIN_ACTION',
          entityType: 'leave_request',
          entityId: created.id,
          metadata: { event: 'LEAVE_REQUEST_SUBMITTED', type: dto.type, startDate: dto.startDate, endDate: dto.endDate, days },
        },
      });
      return created;
    });

    // Notify the requester's supervisor, if any.
    const requester = await this.prisma.user.findFirst({
      where: { id: p.userId, tenantId: p.tenantId },
      select: { supervisorId: true, firstName: true, lastName: true },
    });
    if (requester?.supervisorId) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: requester.supervisorId,
        senderId: p.userId,
        type: 'SUBMISSION',
        category: 'LEAVE',
        title: 'New leave request',
        message: `${requester.firstName} ${requester.lastName} requested ${days} day(s) of ${dto.type.toLowerCase()} leave.`,
        priority: 'NORMAL',
        actionUrl: `/supervisor/leave?leaveRequest=${request.id}`,
        actionLabel: 'Review Request',
      });
    }

    return request;
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  async findMany(p: AuthPrincipal, query: LeaveRequestQuery): Promise<PageResult<LeaveRequest>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const scope = query.scope ?? 'self';

    let scopeFilter: Prisma.LeaveRequestWhereInput;
    if (scope === 'org') {
      if (!this.can(p, PERMISSIONS.LEAVE_REQUEST_READ_ORG)) {
        throw new ForbiddenException('You do not have org-level leave visibility');
      }
      scopeFilter = query.userId ? { userId: query.userId } : {};
    } else if (scope === 'team') {
      if (!this.can(p, PERMISSIONS.LEAVE_REQUEST_READ_TEAM)) {
        throw new ForbiddenException('You do not have team-level leave visibility');
      }
      const teamIds = await this.teamUserIds(p);
      if (query.userId && !teamIds.includes(query.userId)) {
        throw new ForbiddenException('That user is outside your team');
      }
      scopeFilter = { userId: query.userId ?? { in: teamIds } };
    } else {
      scopeFilter = { userId: p.userId };
    }

    const timeZone =
      query.reviewedAtFrom || query.reviewedAtTo ? await this.timeZones.forPrincipal(p) : DEFAULT_TIME_ZONE;

    const where: Prisma.LeaveRequestWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...scopeFilter,
      ...(query.status ? { status: query.status as LeaveRequest['status'] } : {}),
      ...(query.type ? { type: query.type as LeaveType } : {}),
      ...(query.startDateFrom || query.startDateTo
        ? {
            AND: [
              ...(query.startDateFrom ? [{ endDate: { gte: new Date(query.startDateFrom) } }] : []),
              ...(query.startDateTo ? [{ startDate: { lte: new Date(query.startDateTo) } }] : []),
            ],
          }
        : {}),
      // reviewedAtFrom/To are calendar days in the organization's timezone, not
      // UTC: "approved today" must mean the local day. The upper bound is the
      // start of the *next* local day so the whole day is covered.
      ...(query.reviewedAtFrom || query.reviewedAtTo
        ? {
            reviewedAt: {
              ...(query.reviewedAtFrom ? { gte: startOfOrgDay(query.reviewedAtFrom, timeZone) } : {}),
              ...(query.reviewedAtTo ? { lt: startOfOrgDay(query.reviewedAtTo, timeZone, 1) } : {}),
            },
          }
        : {}),
    };

    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const items = await this.prisma.leaveRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, departmentId: true,
            avatarKey: true, department: { select: { name: true } },
          },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = buildPage(items, limit);
    const avatarUrls = await this.storage.signedUrlsByKey(page.data.map((r) => r.user.avatarKey));
    return {
      ...page,
      data: page.data.map((r) => ({ ...r, user: withAvatarUrl(r.user, avatarUrls) })),
    };
  }

  /**
   * Single leave request with everything the detail modal renders: requester,
   * reviewer (approver) and their decision note. Callers that only need the
   * bare row use `findOneRaw`.
   */
  async findOne(p: AuthPrincipal, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, departmentId: true,
            avatarKey: true, department: { select: { name: true } },
          },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.assertCanView(p, request);
    const avatarUrls = await this.storage.signedUrlsByKey([request.user.avatarKey]);
    return { ...request, user: withAvatarUrl(request.user, avatarUrls) };
  }

  private async findOneRaw(p: AuthPrincipal, id: string): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    await this.assertCanView(p, request);
    return request;
  }

  private async assertCanView(p: AuthPrincipal, request: LeaveRequest): Promise<void> {
    if (request.userId === p.userId) return;
    if (this.can(p, PERMISSIONS.LEAVE_REQUEST_READ_ORG)) return;
    if (this.can(p, PERMISSIONS.LEAVE_REQUEST_READ_TEAM)) {
      if ((await this.teamUserIds(p)).includes(request.userId)) return;
    }
    throw new ForbiddenException('You do not have access to this leave request');
  }

  // ── Attachments (single file per request, stored on attachmentKey) ───────

  /** Owner uploads/replaces the attachment on their own PENDING request. */
  async uploadAttachment(
    p: AuthPrincipal,
    id: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.userId !== p.userId) {
      throw new ForbiddenException('You can only attach files to your own leave requests');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Cannot modify attachments on a ${request.status} request`);
    }

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

    // Replace: drop the previous file if one existed.
    if (request.attachmentKey) void this.storage.remove(request.attachmentKey).catch(() => {});

    return this.prisma.leaveRequest.update({
      where: { id },
      data: { attachmentKey: key, updatedBy: p.userId, version: { increment: 1 } },
    });
  }

  /** Signed download URL — visible to anyone who can view the request (owner or reviewer). */
  async getAttachmentSignedUrl(p: AuthPrincipal, id: string): Promise<{ url: string }> {
    const request = await this.findOneRaw(p, id); // enforces assertCanView
    if (!request.attachmentKey) throw new NotFoundException('This request has no attachment');
    const url = await this.storage.signedUrl(request.attachmentKey);
    return { url };
  }

  /** Owner removes the attachment from their own PENDING request. */
  async removeAttachment(p: AuthPrincipal, id: string): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.userId !== p.userId) {
      throw new ForbiddenException('You can only remove attachments from your own leave requests');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Cannot modify attachments on a ${request.status} request`);
    }
    if (!request.attachmentKey) throw new NotFoundException('This request has no attachment');
    void this.storage.remove(request.attachmentKey).catch(() => {});
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { attachmentKey: null, updatedBy: p.userId, version: { increment: 1 } },
    });
  }

  // ── Cancel (self) ───────────────────────────────────────────────────────

  async cancel(p: AuthPrincipal, id: string): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.userId !== p.userId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Cannot cancel a request with status ${request.status}`);
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED', updatedBy: p.userId, version: { increment: 1 } },
    });
  }

  // ── Return to Work / End Leave Early (self) ───────────────────────────

  async returnFromLeave(p: AuthPrincipal, id: string): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.userId !== p.userId) {
      throw new ForbiddenException('You can only confirm return from your own leave');
    }
    if (request.status !== 'APPROVED') {
      throw new ConflictException(`Cannot return early from a leave request with status ${request.status}`);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Set endDate to yesterday so active-leave filter (endDate >= today) no longer matches.
    const newEndDate = new Date(today);
    newEndDate.setUTCDate(today.getUTCDate() - 1);

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.leaveRequest.update({
        where: { id },
        data: {
          endDate: newEndDate < request.startDate ? request.startDate : newEndDate,
          // Terminal status so active-leave views (which filter on APPROVED) drop it
          // immediately, including same-day leaves whose endDate can't move before startDate.
          status: 'COMPLETED',
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: 'ADMIN_ACTION',
          entityType: 'leave_request',
          entityId: id,
          metadata: { event: 'LEAVE_RETURNED_EARLY', originalEndDate: request.endDate, returnDate: new Date() },
        },
      });

      return res;
    });

    // Notify Supervisor + HR users
    const requester = await this.prisma.user.findFirst({
      where: { id: p.userId, tenantId: p.tenantId },
      select: { supervisorId: true, firstName: true, lastName: true },
    });

    const hrUsers = await this.prisma.user.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { key: 'HR' } } },
      },
      select: { id: true },
    });

    const notifyUserIds = new Set<string>();
    if (requester?.supervisorId) notifyUserIds.add(requester.supervisorId);
    hrUsers.forEach((h) => notifyUserIds.add(h.id));

    for (const targetUserId of notifyUserIds) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: targetUserId,
        senderId: p.userId,
        type: 'SUBMISSION',
        category: 'LEAVE',
        title: 'Employee returned to work early',
        message: `${requester?.firstName ?? 'Employee'} ${requester?.lastName ?? ''} has confirmed their return to work and ended their leave.`,
        priority: 'NORMAL',
        actionUrl: `/supervisor/leave?leaveRequest=${id}`,
        actionLabel: 'View Leave Log',
      });
    }

    return updated;
  }

  // ── Decision (supervisor / HR / admin) ─────────────────────────────────

  async decide(p: AuthPrincipal, id: string, dto: LeaveDecisionDto): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Leave request not found');

    if (request.userId === p.userId) {
      throw new ForbiddenException('You cannot decide on your own leave request');
    }
    if (!this.can(p, PERMISSIONS.LEAVE_REQUEST_READ_ORG)) {
      if (!this.can(p, PERMISSIONS.LEAVE_REQUEST_READ_TEAM) || !(await this.teamUserIds(p)).includes(request.userId)) {
        throw new ForbiddenException('This leave request is outside your scope');
      }
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Cannot decide a request with status ${request.status}`);
    }
    if (request.version !== dto.expectedVersion) {
      throw new ConflictException('Version mismatch — please refresh and retry');
    }
    if (dto.action === 'REJECT' && !dto.remark?.trim()) {
      throw new UnprocessableEntityException('A remark is required when rejecting a leave request');
    }

    const nextStatus = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const year = request.startDate.getUTCFullYear();

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          reviewedBy: p.userId,
          reviewedAt: new Date(),
          reviewNote: dto.remark ?? null,
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: dto.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
          entityType: 'leave_request',
          entityId: id,
          metadata: { action: dto.action, remark: dto.remark ?? null },
        },
      }),
    ];

    if (dto.action === 'APPROVE') {
      ops.push(
        this.prisma.leaveBalance.upsert({
          where: {
            tenantId_userId_type_year: { tenantId: p.tenantId, userId: request.userId, type: request.type, year },
          },
          create: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            userId: request.userId,
            type: request.type,
            year,
            allocatedDays: DEFAULT_ALLOCATIONS[request.type],
            usedDays: request.days,
          },
          update: { usedDays: { increment: request.days } },
        }),
      );
    }

    const [updated] = await this.prisma.$transaction(ops) as [LeaveRequest, ...unknown[]];

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: request.userId,
      senderId: p.userId,
      type: dto.action === 'APPROVE' ? 'APPROVAL_DECISION' : 'REJECTION',
      category: 'LEAVE',
      title: dto.action === 'APPROVE' ? 'Leave request approved' : 'Leave request rejected',
      message:
        dto.action === 'APPROVE'
          ? `Your ${request.type.toLowerCase()} leave request has been approved.`
          : `Your leave request was rejected: ${dto.remark}`,
      priority: dto.action === 'APPROVE' ? 'NORMAL' : 'HIGH',
      actionUrl: `/dashboard?leaveRequest=${id}`,
      actionLabel: 'View Details',
    });

    return updated;
  }

  // ── Balances ────────────────────────────────────────────────────────────

  async getBalances(p: AuthPrincipal, userId?: string) {
    const targetUserId = userId ?? p.userId;
    if (targetUserId !== p.userId && !this.can(p, PERMISSIONS.LEAVE_BALANCE_READ_ORG)) {
      throw new ForbiddenException('You do not have access to this balance');
    }

    const year = new Date().getUTCFullYear();
    const existing = await this.prisma.leaveBalance.findMany({
      where: { tenantId: p.tenantId, userId: targetUserId, year },
    });
    const byType = new Map(existing.map((b) => [b.type, b]));

    const results = await Promise.all(
      (Object.keys(DEFAULT_ALLOCATIONS) as LeaveType[]).map(async (type) => {
        const found = byType.get(type);
        if (found) return found;
        return this.prisma.leaveBalance.upsert({
          where: { tenantId_userId_type_year: { tenantId: p.tenantId, userId: targetUserId, type, year } },
          create: {
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            userId: targetUserId,
            type,
            year,
            allocatedDays: DEFAULT_ALLOCATIONS[type],
            usedDays: 0,
          },
          update: {},
        });
      }),
    );

    return results.map((b) => ({
      type: b.type,
      year: b.year,
      allocatedDays: Number(b.allocatedDays),
      usedDays: Number(b.usedDays),
      remainingDays: Number(b.allocatedDays) - Number(b.usedDays),
    }));
  }
}
