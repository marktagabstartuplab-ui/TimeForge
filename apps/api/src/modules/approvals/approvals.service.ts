import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApprovalAction, AuditAction, Prisma, Timesheet, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, PageResult } from '../../common/crud/crud.service';
import { AuthPrincipal } from '../../common/decorators';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { PERMISSIONS } from '@timeforge/shared';
import { KpiService } from '../kpi/kpi.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AddRemarkDto, ApprovalActionDto, ApprovalQueue, DecisionDto } from './dto';

/** Map API action string to DB ApprovalAction enum + resulting TimesheetStatus + AuditAction. */
const ACTION_MAP: Record<
  ApprovalActionDto,
  { dbAction: ApprovalAction; nextStatus: TimesheetStatus; auditAction: AuditAction }
> = {
  APPROVE: { dbAction: 'APPROVE', nextStatus: 'APPROVED', auditAction: 'APPROVE' },
  REJECT: { dbAction: 'REJECT', nextStatus: 'REJECTED', auditAction: 'REJECT' },
  REQUEST_REVISION: {
    dbAction: 'REQUEST_REVISION',
    nextStatus: 'REVISION_REQUESTED',
    auditAction: 'REVISION_REQUEST',
  },
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpiService: KpiService,
    private readonly notifications: NotificationsService,
    private readonly deptScope: DepartmentScopeService,
  ) {}

  // -- Queue / reads --

  /**
   * Returns timesheets pending review for this supervisor's team (or org for Admin).
   */
  async findQueue(
    p: AuthPrincipal,
    query: ApprovalQueue,
  ): Promise<PageResult<Timesheet>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const where: Prisma.TimesheetWhereInput = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      deletedAt: null,
      status: query.status
        ? (query.status as TimesheetStatus)
        : { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      ...(await this.resolveTeamFilter(p, query.userId)),
      ...(query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {}),
    };
    const items = await this.prisma.timesheet.findMany({
      where,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return buildPage(items, limit);
  }

  /**
   * Returns a timesheet + its full approval history.
   */
  async findDetail(p: AuthPrincipal, timesheetId: string) {
    const sheet = await this.prisma.timesheet.findFirst({
      where: {
        id: timesheetId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
      },
      include: { approvals: { orderBy: { createdAt: 'asc' } } },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.assertCanActOnSheet(p, sheet);
    return sheet;
  }

  // -- Decisions --

  /**
   * Supervisor / Admin: make an approval decision.
   * State machine: SUBMITTED | UNDER_REVIEW -> APPROVED | REJECTED | REVISION_REQUESTED
   *
   * This is the SOLE approval decision path in the system (see docs/Backend-RC-Review.md
   * C1) -- the timesheet-level decide() endpoint has been removed.
   */
  async decide(
    p: AuthPrincipal,
    timesheetId: string,
    dto: DecisionDto,
  ): Promise<Timesheet> {
    const sheet = await this.prisma.timesheet.findFirst({
      where: {
        id: timesheetId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
      },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');

    // BR-APP-04: no self-approval
    if (sheet.userId === p.userId) {
      throw new ForbiddenException('You cannot approve your own timesheet (BR-APP-04)');
    }

    // Scope check: supervisor can only act on their team
    await this.assertCanActOnSheet(p, sheet);

    // State machine guard
    const submittable: TimesheetStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];
    if (!submittable.includes(sheet.status)) {
      throw new ConflictException(
        `Cannot decide a timesheet with status ${sheet.status}`,
      );
    }

    // Optimistic lock
    if (sheet.version !== dto.expectedVersion) {
      throw new ConflictException('Version mismatch -- please refresh and retry');
    }

    const { dbAction, nextStatus, auditAction } = ACTION_MAP[dto.action];

    // BR-APP-02: REJECT and REQUEST_REVISION require a non-empty remark
    if ((dto.action === 'REJECT' || dto.action === 'REQUEST_REVISION') && !dto.remark?.trim()) {
      throw new UnprocessableEntityException(
        'A non-empty remark is required when rejecting or requesting revision (BR-APP-02)',
      );
    }

    // Run as a transaction: update timesheet status + create approval record + audit log (M1)
    const [updatedSheet] = await this.prisma.$transaction([
      this.prisma.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: nextStatus,
          decidedAt: new Date(),
          updatedBy: p.userId,
          version: { increment: 1 },
        },
      }),
      this.prisma.approval.create({
        data: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          timesheetId,
          supervisorId: p.userId,
          lastAction: dbAction,
          resultingState: nextStatus,
          remark: dto.remark ?? null,
          actedAt: new Date(),
          createdBy: p.userId,
          updatedBy: p.userId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: p.tenantId,
          actorId: p.userId,
          action: auditAction,
          entityType: 'timesheet',
          entityId: timesheetId,
          metadata: { action: dto.action, resultingState: nextStatus, remark: dto.remark ?? null },
        },
      }),
    ]);

    // BR-KPI-01: on APPROVE, update KPI progress from the approved hours
    if (dto.action === 'APPROVE' && sheet.totalMinutes > 0) {
      // Fetch the approved employee's role and department for KPI scoping
      const employee = await this.prisma.user.findFirst({
        where: { id: sheet.userId },
        select: {
          departmentId: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      });
      await this.kpiService.upsertProgressFromApproval(
        p.tenantId,
        p.organizationId,
        sheet.userId,
        sheet.totalMinutes,
        employee?.roles.map((r) => r.role.name) ?? [],
        employee?.departmentId ?? null,
      );
    }

    const DECISION_COPY = {
      APPROVE: { type: 'APPROVAL_DECISION' as const, title: 'Timesheet approved', message: 'Your timesheet has been approved.' },
      REJECT: { type: 'REJECTION' as const, title: 'Timesheet rejected', message: `Reason: ${dto.remark}` },
      REQUEST_REVISION: { type: 'REVISION_REQUEST' as const, title: 'Revision requested', message: `Your supervisor requested changes: ${dto.remark}` },
    };
    const copy = DECISION_COPY[dto.action];
    await this.notifications.create({
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: sheet.userId,
      senderId: p.userId,
      type: copy.type,
      category: 'TIMESHEETS',
      title: copy.title,
      message: copy.message,
      priority: dto.action === 'APPROVE' ? 'NORMAL' : 'HIGH',
      actionUrl: '/timesheets',
      actionLabel: 'View Details',
    });

    return updatedSheet;
  }

  /**
   * Add a standalone remark to a timesheet's approval trail without changing state.
   * Supervisors / Admins only, scoped to their team.
   */
  async addRemark(
    p: AuthPrincipal,
    timesheetId: string,
    dto: AddRemarkDto,
  ) {
    const sheet = await this.prisma.timesheet.findFirst({
      where: {
        id: timesheetId,
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        deletedAt: null,
      },
    });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.assertCanActOnSheet(p, sheet);

    // A remark requires at least one prior decision
    const lastApproval = await this.prisma.approval.findFirst({
      where: { timesheetId, tenantId: p.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastApproval) {
      throw new ConflictException('Cannot add a remark before the first approval action');
    }

    return this.prisma.approval.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        timesheetId,
        supervisorId: p.userId,
        lastAction: lastApproval.lastAction, // keeps the last action type; remark is the note
        resultingState: sheet.status,
        remark: dto.body,
        actedAt: new Date(),
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  // -- Private helpers --

  private can(p: AuthPrincipal, perm: string): boolean {
    return p.permissions.includes('*') || p.permissions.includes(perm);
  }

  /**
   * Resolves team filter for the queue. Org readers see everything; supervisors
   * only see their team's submissions.
   */
  private async resolveTeamFilter(
    p: AuthPrincipal,
    requestedUserId?: string,
  ): Promise<Prisma.TimesheetWhereInput> {
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)) {
      return requestedUserId ? { userId: requestedUserId } : {};
    }
    const teamIds = await this.teamUserIds(p);
    if (requestedUserId && !teamIds.includes(requestedUserId)) {
      throw new ForbiddenException('That user is outside your team');
    }
    return { userId: requestedUserId ?? { in: teamIds } };
  }

  /**
   * Asserts that the caller is allowed to act on the given timesheet
   * (either Admin/Org-level or the supervisor of the sheet owner's team).
   */
  private async assertCanActOnSheet(
    p: AuthPrincipal,
    sheet: { userId: string },
  ): Promise<void> {
    if (this.can(p, PERMISSIONS.TIMESHEET_READ_ORG)) return; // Admin
    if (this.can(p, PERMISSIONS.APPROVAL_READ_TEAM)) {
      if ((await this.teamUserIds(p)).includes(sheet.userId)) return;
      throw new ForbiddenException('This timesheet is outside your team scope (BR-APP-03)');
    }
    throw new ForbiddenException('You do not have approval permissions');
  }

  /** Department-based supervision scope (Department.managerId). */
  private teamUserIds(p: AuthPrincipal): Promise<string[]> {
    return this.deptScope.teamUserIds(p);
  }
}
