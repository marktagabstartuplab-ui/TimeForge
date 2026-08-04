import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, GrievanceCategory, GrievanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { PERMISSIONS } from '@timeforge/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGrievanceDto, GrievanceQueryDto, UpdateGrievanceDto } from './dto';

@Injectable()
export class GrievancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Submit a new grievance/complaint.
   * Accessible to all employees.
   */
  async createGrievance(p: AuthPrincipal, dto: CreateGrievanceDto) {
    const isAnonymous = dto.isAnonymous ?? false;

    const grievance = await this.prisma.grievance.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: p.userId,
        subject: dto.subject,
        category: dto.category,
        description: dto.description,
        isAnonymous,
        status: GrievanceStatus.SUBMITTED,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'grievance',
        entityId: grievance.id,
        metadata: { action: 'submitGrievance', isAnonymous, category: dto.category },
      },
    }).catch(() => {});

    // Notify HR users about new complaint submission (without disclosing employee identity if anonymous)
    const hrUsers = await this.prisma.userRole.findMany({
      where: {
        role: { key: 'HR' },
        user: { tenantId: p.tenantId, organizationId: p.organizationId, status: 'ACTIVE', deletedAt: null },
      },
      select: { userId: true },
    });

    for (const hr of hrUsers) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: hr.userId,
        senderId: p.userId,
        type: 'ANNOUNCEMENT',
        category: 'SYSTEM',
        title: 'New HR Grievance Submitted',
        message: `A new complaint titled "${dto.subject}" has been submitted to HR.`,
        actionUrl: '/admin/grievances',
        actionLabel: 'View Inbox',
      }).catch(() => {});
    }

    return this.formatForUser(grievance, p.userId, p.roles, p.permissions);
  }

  /**
   * Employee self-view: list their own submitted complaints.
   * Internal HR notes are stripped from employee response.
   */
  async findMyGrievances(p: AuthPrincipal, query: GrievanceQueryDto) {
    const where: Prisma.GrievanceWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      employeeId: p.userId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };

    const items = await this.prisma.grievance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.formatForUser(item, p.userId, p.roles, p.permissions));
  }

  /**
   * HR / Admin inbox: list all complaints in the organization.
   * Bypasses supervisor hierarchy. If anonymous, employee details are omitted.
   */
  async findAllGrievances(p: AuthPrincipal, query: GrievanceQueryDto) {
    if (!this.canReadOrg(p)) {
      throw new ForbiddenException('Only HR and Admin can access the HR Grievance Inbox');
    }

    const where: Prisma.GrievanceWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };

    const items = await this.prisma.grievance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => {
      const formatted = this.formatForUser(item, p.userId, p.roles, p.permissions);
      if (item.isAnonymous) {
        return {
          ...formatted,
          employee: {
            id: 'ANONYMOUS',
            firstName: 'Anonymous',
            lastName: 'Employee',
            email: 'hidden@anonymous.local',
            jobTitle: null,
            department: null,
          },
        };
      }
      return formatted;
    });
  }

  /**
   * Get detail for a single grievance.
   */
  async findOneGrievance(p: AuthPrincipal, id: string) {
    const item = await this.prisma.grievance.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Grievance record not found');

    const canManage = this.canReadOrg(p);
    if (item.employeeId !== p.userId && !canManage) {
      throw new ForbiddenException('Not authorized to view this complaint');
    }

    const formatted = this.formatForUser(item, p.userId, p.roles, p.permissions);
    if (item.isAnonymous && canManage && item.employeeId !== p.userId) {
      return {
        ...formatted,
        employee: {
          id: 'ANONYMOUS',
          firstName: 'Anonymous',
          lastName: 'Employee',
          email: 'hidden@anonymous.local',
          jobTitle: null,
          department: null,
        },
      };
    }
    return formatted;
  }

  /**
   * HR update: update status (UNDER_REVIEW, RESOLVED) and add internal notes (hidden from employee).
   */
  async updateGrievance(p: AuthPrincipal, id: string, dto: UpdateGrievanceDto) {
    if (!this.canUpdate(p)) {
      throw new ForbiddenException('Only HR and Admin can update complaints');
    }

    const existing = await this.prisma.grievance.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });

    if (!existing) throw new NotFoundException('Grievance record not found');

    const newStatus = dto.status ?? existing.status;
    const resolvedAt = newStatus === GrievanceStatus.RESOLVED && !existing.resolvedAt ? new Date() : existing.resolvedAt;

    const updated = await this.prisma.grievance.update({
      where: { id },
      data: {
        status: newStatus,
        internalNotes: dto.internalNotes !== undefined ? dto.internalNotes : existing.internalNotes,
        resolvedAt,
        updatedBy: p.userId,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'grievance',
        entityId: id,
        metadata: { action: 'updateGrievance', status: newStatus, previousStatus: existing.status },
      },
    }).catch(() => {});

    // Notify employee when status updates (without sending internal notes)
    if (existing.status !== newStatus) {
      await this.notifications.create({
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: existing.employeeId,
        senderId: p.userId,
        type: 'ANNOUNCEMENT',
        category: 'SYSTEM',
        title: `Complaint Status Updated: ${newStatus.replace(/_/g, ' ')}`,
        message: `Your submitted complaint "${existing.subject}" status is now ${newStatus.replace(/_/g, ' ')}.`,
        actionUrl: '/grievances',
        actionLabel: 'View Status',
      }).catch(() => {});
    }

    return this.formatForUser(updated, p.userId, p.roles, p.permissions);
  }

  private formatForUser(item: any, userId: string, roles: string[], permissions: string[]) {
    const isHrOrAdmin = this.canReadOrg({ roles, permissions } as any);
    const isOwner = item.employeeId === userId;

    // If employee reading their own complaint, omit internal HR notes
    const copy = { ...item };
    if (!isHrOrAdmin && isOwner) {
      delete copy.internalNotes;
    }

    return copy;
  }

  private canReadOrg(p: AuthPrincipal): boolean {
    return p.permissions.includes('*') || p.permissions.includes(PERMISSIONS.GRIEVANCE_READ_ORG) || p.roles.includes('HR');
  }

  private canUpdate(p: AuthPrincipal): boolean {
    return p.permissions.includes('*') || p.permissions.includes(PERMISSIONS.GRIEVANCE_UPDATE) || p.roles.includes('HR');
  }
}
