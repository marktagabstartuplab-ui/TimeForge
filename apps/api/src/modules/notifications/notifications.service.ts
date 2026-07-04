import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuditAction, Notification, Prisma } from '@prisma/client';

const VALID_STATUSES = ['PENDING', 'SENT', 'READ', 'FAILED'] as const;
const VALID_TYPES = [
  'SUBMISSION',
  'APPROVAL_DECISION',
  'REVISION_REQUEST',
  'DEADLINE',
  'PAYROLL_READY',
  'AI_REPORT',
  'EMPLOYEE_APPROVAL_REQUEST',
] as const;

type NotifStatus = typeof VALID_STATUSES[number];
type NotifType   = typeof VALID_TYPES[number];

export interface ListNotificationsQuery {
  status?: string;
  type?: string;
  limit?: string;
  cursor?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List ────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, userId: string, query: ListNotificationsQuery): Promise<PageResult<unknown>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const where: Record<string, unknown> = {
      tenantId,
      userId,
      deletedAt: null,
    };

    if (query.status && (VALID_STATUSES as readonly string[]).includes(query.status)) {
      where['status'] = query.status as NotifStatus;
    }

    if (query.type && (VALID_TYPES as readonly string[]).includes(query.type)) {
      where['type'] = query.type as NotifType;
    }

    const rows = await (this.prisma as any).notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return buildPage(rows, limit);
  }

  // ─── Count ────────────────────────────────────────────────────────────────

  async count(tenantId: string, userId: string): Promise<{ total: number; unread: number }> {
    const [total, unread] = await Promise.all([
      (this.prisma as any).notification.count({
        where: { tenantId, userId, deletedAt: null },
      }),
      (this.prisma as any).notification.count({
        where: {
          tenantId,
          userId,
          deletedAt: null,
          status: { not: 'READ' as NotifStatus },
        },
      }),
    ]);
    return { total, unread };
  }

  // ─── Mark one read ────────────────────────────────────────────────────────

  async markRead(tenantId: string, userId: string, id: string) {
    const existing = await (this.prisma as any).notification.findFirst({
      where: { id, tenantId, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    const updated = await (this.prisma as any).notification.update({
      where: { id },
      data: {
        status: 'READ' as NotifStatus,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    await this.audit(tenantId, userId, id);
    return updated;
  }

  // ─── Mark all read ────────────────────────────────────────────────────────

  async markAllRead(tenantId: string, userId: string): Promise<{ updated: number }> {
    const result = await (this.prisma as any).notification.updateMany({
      where: {
        tenantId,
        userId,
        status: { not: 'READ' as NotifStatus },
        deletedAt: null,
      },
      data: {
        status: 'READ' as NotifStatus,
        updatedBy: userId,
      },
    });

    if (result.count > 0) {
      await this.audit(tenantId, userId, undefined, { count: result.count });
    }

    return { updated: result.count };
  }

  // ─── Create ──────────────────────────────────────────────────────────────

  /** Creates an in-app (or email-flagged) notification for a user. Used by other services — not exposed via HTTP. */
  async create(
    tenantId: string,
    userId: string,
    type: NotifType,
    payload: Record<string, unknown> = {},
    channel: 'IN_APP' | 'EMAIL' = 'IN_APP',
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        tenantId,
        userId,
        type,
        channel,
        status: 'SENT',
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  // ─── Audit helper ─────────────────────────────────────────────────────────

  private async audit(
    tenantId: string,
    actorId: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: AuditAction.SETTINGS_CHANGE,
        entityType: 'notification',
        ...(entityId ? { entityId } : {}),
        ...(metadata  ? { metadata: metadata as Prisma.InputJsonValue }  : {}),
      },
    });
  }
}
