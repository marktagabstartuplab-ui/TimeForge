import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Notification, NotificationCategory, NotificationChannel, NotificationPriority, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { CreateAnnouncementDto, ListNotificationsQueryDto, NotificationSort } from './dto';

export interface CreateNotificationInput {
  tenantId: string;
  organizationId: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  senderId?: string | null;
  priority?: NotificationPriority;
  actionUrl?: string | null;
  actionLabel?: string | null;
  metadata?: Record<string, unknown>;
  channel?: NotificationChannel;
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: NotificationsRealtimeService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── List ────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, userId: string, query: ListNotificationsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const where: Prisma.NotificationWhereInput = {
      tenantId,
      userId,
      deletedAt: null,
      isArchived: query.archived ?? false,
    };
    if (query.category) where.category = query.category;
    if (query.unreadOnly) where.isRead = false;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { message: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: this.resolveSort(query.sortBy),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  private resolveSort(sortBy?: NotificationSort): Prisma.NotificationOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'priority':
        return [{ priority: 'desc' }, { createdAt: 'desc' }];
      case 'unread':
        return [{ isRead: 'asc' }, { createdAt: 'desc' }];
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  // ─── Unread count ────────────────────────────────────────────────────────

  async unreadCount(tenantId: string, userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({
      where: { tenantId, userId, deletedAt: null, isArchived: false, isRead: false },
    });
    return { unread };
  }

  // ─── Mark one read ───────────────────────────────────────────────────────

  async markRead(tenantId: string, userId: string, id: string): Promise<Notification> {
    const existing = await this.prisma.notification.findFirst({ where: { id, tenantId, userId, deletedAt: null } });
    if (!existing) throw new NotFoundException(`Notification ${id} not found`);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: existing.readAt ?? new Date(), updatedBy: userId, version: { increment: 1 } },
    });
    void this.realtime.broadcastUpdate(updated).catch((err: unknown) => console.error('[Notifications] Realtime broadcast failed:', err));
    return updated;
  }

  // ─── Mark all read ───────────────────────────────────────────────────────

  async markAllRead(tenantId: string, userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId, userId, isRead: false, deletedAt: null },
      data: { isRead: true, readAt: new Date(), updatedBy: userId },
    });
    if (result.count > 0) {
      void this.realtime.broadcastCountChanged(tenantId, userId).catch((err: unknown) => console.error('[Notifications] Realtime broadcast failed:', err));
    }
    return { updated: result.count };
  }

  // ─── Archive ─────────────────────────────────────────────────────────────

  async archive(tenantId: string, userId: string, id: string): Promise<Notification> {
    const existing = await this.prisma.notification.findFirst({ where: { id, tenantId, userId, deletedAt: null } });
    if (!existing) throw new NotFoundException(`Notification ${id} not found`);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isArchived: true, updatedBy: userId, version: { increment: 1 } },
    });
    void this.realtime.broadcastUpdate(updated).catch((err: unknown) => console.error('[Notifications] Realtime broadcast failed:', err));
    return updated;
  }

  // ─── Delete (soft) ───────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    const existing = await this.prisma.notification.findFirst({ where: { id, tenantId, userId, deletedAt: null } });
    if (!existing) throw new NotFoundException(`Notification ${id} not found`);

    await this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId, version: { increment: 1 } },
    });
    void this.realtime.broadcastCountChanged(tenantId, userId).catch((err: unknown) => console.error('[Notifications] Realtime broadcast failed:', err));
  }

  // ─── Create (internal — called by other services) ───────────────────────

  async create(input: CreateNotificationInput): Promise<Notification> {
    const channel = input.channel ?? 'IN_APP';
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        userId: input.userId,
        senderId: input.senderId ?? null,
        type: input.type,
        category: input.category,
        priority: input.priority ?? 'NORMAL',
        channel,
        status: channel === 'EMAIL' ? 'PENDING' : 'SENT',
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? null,
        actionLabel: input.actionLabel ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (channel === 'EMAIL') {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (user?.email) {
        void this.notificationsQueue.add(
          'deliver',
          {
            notificationId: notification.id,
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            userId: input.userId,
            email: user.email,
            title: input.title,
            message: input.message,
            channel: 'EMAIL',
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
        ).catch((err: unknown) => console.error('[Notifications] Failed to enqueue email delivery:', err));
      }
    }

    if (channel === 'IN_APP') {
      void this.realtime.broadcastNewNotification(notification).catch((err: unknown) => console.error('[Notifications] Realtime broadcast failed:', err));
    }
    return notification;
  }

  // ─── Admin: org-wide announcement ────────────────────────────────────────

  /** Fans an announcement out to every active user in the caller's organization. */
  async createAnnouncement(caller: AuthPrincipal, dto: CreateAnnouncementDto): Promise<{ sent: number }> {
    if (!caller.permissions.includes('*') && !caller.permissions.includes('notification:create_org')) {
      throw new ForbiddenException('Missing required permission: notification:create_org');
    }
    const recipients = await this.prisma.user.findMany({
      where: { tenantId: caller.tenantId, organizationId: caller.organizationId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });

    await this.prisma.notification.createMany({
      data: recipients.map((r) => ({
        tenantId: caller.tenantId,
        organizationId: caller.organizationId,
        userId: r.id,
        senderId: caller.userId,
        type: 'ANNOUNCEMENT' as NotificationType,
        category: 'SYSTEM' as NotificationCategory,
        priority: dto.priority ?? 'NORMAL',
        channel: 'IN_APP' as NotificationChannel,
        status: 'SENT',
        title: dto.title,
        message: dto.message,
        actionUrl: dto.actionUrl ?? null,
        actionLabel: dto.actionLabel ?? null,
      })),
    });

    void Promise.all(recipients.map((r) => this.realtime.broadcastCountChanged(caller.tenantId, r.id))).catch(
      (err: unknown) => console.error('[Notifications] Realtime broadcast failed:', err),
    );

    return { sent: recipients.length };
  }
}
