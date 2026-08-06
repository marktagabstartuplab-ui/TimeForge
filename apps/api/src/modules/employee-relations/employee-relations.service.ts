import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, ClearanceStatus, DisciplineStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateGrievanceDto, CreateNteDto, InitiateClearanceDto, RespondNteDto } from './dto';

@Injectable()
export class EmployeeRelationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── NTE (Notice to Explain) Disciplinary Memos ──────────────────────────────

  async createNte(p: AuthPrincipal, dto: CreateNteDto) {
    const employee = await this.prisma.user.findFirst({
      where: { id: dto.employeeId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const nte = await this.prisma.disciplineRecord.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: dto.employeeId,
        issuerId: p.userId,
        title: dto.title,
        violationDescription: dto.violationDescription,
        status: DisciplineStatus.ISSUED,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'discipline_record',
        entityId: nte.id,
        metadata: { event: 'NTE_ISSUED', employeeId: dto.employeeId, title: dto.title },
      },
    });

    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: dto.employeeId,
      senderId: p.userId,
      type: 'ANNOUNCEMENT',
      category: 'ACCOUNT',
      priority: 'HIGH',
      title: 'Notice to Explain (NTE) Issued',
      message: `You have received a disciplinary notice: "${dto.title}". Please submit your explanation.`,
      actionUrl: '/hr/employee-relations',
      actionLabel: 'View Disciplinary Memo',
    });

    return nte;
  }

  async findNtesForUser(p: AuthPrincipal, requestedUserId?: string) {
    const targetUserId = requestedUserId ?? p.userId;
    const isHrOrAdmin = p.permissions.includes('*') || p.permissions.includes('discipline:read_org');
    if (!isHrOrAdmin && targetUserId !== p.userId) {
      throw new ForbiddenException('You can only view your own disciplinary records');
    }

    return this.prisma.disciplineRecord.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(isHrOrAdmin && !requestedUserId ? {} : { employeeId: targetUserId }),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        issuer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respondNte(p: AuthPrincipal, id: string, dto: RespondNteDto) {
    const nte = await this.prisma.disciplineRecord.findFirst({
      where: { id, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!nte) throw new NotFoundException('Disciplinary record not found');
    if (nte.employeeId !== p.userId && !p.permissions.includes('*') && !p.permissions.includes('discipline:create')) {
      throw new ForbiddenException('You cannot respond to another employee\'s NTE');
    }

    const updated = await this.prisma.disciplineRecord.update({
      where: { id },
      data: {
        employeeResponse: dto.response,
        respondedAt: new Date(),
        status: DisciplineStatus.RESPONDED,
        updatedBy: p.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'discipline_record',
        entityId: nte.id,
        metadata: { event: 'NTE_RESPONDED', employeeId: nte.employeeId },
      },
    });

    return updated;
  }

  // ── Grievance Inbox (HR Dashboard) ──────────────────────────────────────────

  async createGrievance(p: AuthPrincipal, dto: CreateGrievanceDto) {
    return this.prisma.grievance.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: p.userId,
        subject: dto.subject,
        category: dto.category ?? 'OTHER',
        description: dto.description,
        isAnonymous: dto.isAnonymous ?? false,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  async findGrievances(p: AuthPrincipal) {
    const isHrOrAdmin = p.permissions.includes('*') || p.permissions.includes('grievance:read_org');
    if (!isHrOrAdmin) {
      throw new ForbiddenException('Grievance Inbox is restricted to HR and Admin roles');
    }

    return this.prisma.grievance.findMany({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true, department: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Clearance Tracker (Exiting Employees) ───────────────────────────────────

  async initiateClearance(p: AuthPrincipal, dto: InitiateClearanceDto) {
    const employee = await this.prisma.user.findFirst({
      where: { id: dto.employeeId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const existing = await this.prisma.clearanceChecklist.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, employeeId: dto.employeeId, deletedAt: null },
    });
    if (existing) {
      throw new UnprocessableEntityException('Clearance checklist already exists for this employee');
    }

    const checklist = await this.prisma.clearanceChecklist.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        employeeId: dto.employeeId,
        status: ClearanceStatus.PENDING,
        notes: dto.notes,
        createdBy: p.userId,
        updatedBy: p.userId,
        items: {
          create: [
            { tenantId: p.tenantId, department: 'IT', title: 'Return Laptop & Company Equipment' },
            { tenantId: p.tenantId, department: 'FINANCE', title: 'Settle Cash Advances & Expenses' },
            { tenantId: p.tenantId, department: 'HR', title: 'Exit Interview & Company ID Surrender' },
          ],
        },
      },
      include: { items: true },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'clearance_checklist',
        entityId: checklist.id,
        metadata: { event: 'CLEARANCE_INITIATED', employeeId: dto.employeeId },
      },
    });

    return checklist;
  }

  async findClearances(p: AuthPrincipal, requestedEmployeeId?: string) {
    const isHrOrAdmin = p.permissions.includes('*') || p.permissions.includes('clearance:read_org');
    const targetUserId = requestedEmployeeId ?? (isHrOrAdmin ? undefined : p.userId);

    return this.prisma.clearanceChecklist.findMany({
      where: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
        ...(targetUserId ? { employeeId: targetUserId } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true, department: { select: { name: true } } } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveClearanceItem(p: AuthPrincipal, checklistId: string, itemId: string, notes?: string) {
    const checklist = await this.prisma.clearanceChecklist.findFirst({
      where: { id: checklistId, tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      include: { items: true },
    });
    if (!checklist) throw new NotFoundException('Clearance checklist not found');

    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Clearance item not found');

    await this.prisma.clearanceItem.update({
      where: { id: itemId },
      data: { isApproved: true, approvedBy: p.userId, approvedAt: new Date(), notes: notes ?? item.notes },
    });

    // Check if all items are approved
    const remainingUnapproved = checklist.items.filter((i) => i.id !== itemId && !i.isApproved);
    let nextStatus = checklist.status;
    if (remainingUnapproved.length === 0) {
      nextStatus = ClearanceStatus.COMPLETED;
      await this.prisma.clearanceChecklist.update({
        where: { id: checklistId },
        data: { status: ClearanceStatus.COMPLETED, completedAt: new Date(), updatedBy: p.userId },
      });
    } else if (checklist.status === ClearanceStatus.PENDING) {
      nextStatus = ClearanceStatus.IN_PROGRESS;
      await this.prisma.clearanceChecklist.update({
        where: { id: checklistId },
        data: { status: ClearanceStatus.IN_PROGRESS, updatedBy: p.userId },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        actorId: p.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'clearance_item',
        entityId: itemId,
        metadata: { event: 'CLEARANCE_ITEM_APPROVED', checklistId, department: item.department, nextStatus },
      },
    });

    return this.prisma.clearanceChecklist.findUnique({
      where: { id: checklistId },
      include: { employee: { select: { firstName: true, lastName: true } }, items: true },
    });
  }
}
