import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { buildPage, decodeCursor } from '../../common/crud/crud.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateMeDto,
  AssignRolesDto,
  UsersListQuery,
  ApproveUserDto,
  RejectUserDto,
} from './dto';
import { MailerService } from '../../infra/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
  ) {}

  private isFinanceOrAdmin(user: AuthPrincipal): boolean {
    return user.roles.some((r) => r === 'FINANCE' || r === 'ADMIN') || user.permissions.includes('*');
  }

  private sanitize(user: Record<string, unknown>, caller: AuthPrincipal) {
    if (!this.isFinanceOrAdmin(caller)) {
      // BR-PAY-06: hourly rate hidden from self / Supervisor / HR
      const { hourlyRate: _, ...rest } = user;
      return rest;
    }
    return user;
  }

  async findAll(caller: AuthPrincipal, query: UsersListQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};
    const where: Record<string, unknown> = {
      tenantId: caller.tenantId,
      organizationId: caller.organizationId,
      deletedAt: null,
      ...cursorWhere,
    };
    if (query.status) where['status'] = query.status;
    if (query.departmentId) where['departmentId'] = query.departmentId;
    if (query.teamId) where['teamId'] = query.teamId;
    if (query.q) {
      where['OR'] = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    let users = await this.prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } } },
      orderBy: { lastName: 'asc' },
      take: limit + 1,
    });

    // Filter by role key if requested (post-filter — role is a relation)
    if (query.role) {
      users = users.filter((u) => u.roles.some((ur) => ur.role.key === query.role));
    }

    const page = buildPage(users, limit);
    return {
      data: page.data.map((u) => this.sanitize(u as unknown as Record<string, unknown>, caller)),
      page: page.page,
    };
  }

  async findOne(caller: AuthPrincipal, id: string) {
    // Self read uses user:read_self; others need user:read
    if (id !== caller.userId && !caller.permissions.includes('user:read') && !caller.permissions.includes('*')) {
      throw new ForbiddenException('Missing required permission: user:read');
    }
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: caller.tenantId, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user as unknown as Record<string, unknown>, caller);
  }

  async findMe(caller: AuthPrincipal) {
    return this.findOne(caller, caller.userId);
  }

  async create(caller: AuthPrincipal, dto: CreateUserDto) {
    // Check for duplicate email within tenant
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: caller.tenantId, email: dto.email.toLowerCase(), deletedAt: null },
    });
    if (existing) throw new ConflictException('A user with this email already exists');

    // Resolve role
    const role = await this.prisma.role.findFirst({
      where: { tenantId: caller.tenantId, key: dto.role },
    });
    if (!role) throw new NotFoundException(`Role '${dto.role}' not found`);

    const { role: _roleKey, ...userData } = dto;
    const user = await this.prisma.user.create({
      data: {
        tenantId: caller.tenantId,
        organizationId: caller.organizationId,
        email: userData.email.toLowerCase(),
        firstName: userData.firstName,
        lastName: userData.lastName,
        employmentType: userData.employmentType,
        departmentId: userData.departmentId ?? null,
        teamId: userData.teamId ?? null,
        supervisorId: userData.supervisorId ?? null,
        payrollEligible: userData.payrollEligible ?? (userData.employmentType !== 'INTERN'),
        status: UserStatus.INVITED,
        createdBy: caller.userId,
        updatedBy: caller.userId,
      },
    });

    await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'user', user.id);

    return this.findOne(caller, user.id);
  }

  async update(caller: AuthPrincipal, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId: caller.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');

    const { version, ...rest } = dto;
    await this.prisma.user.update({
      where: { id },
      data: { ...rest, updatedBy: caller.userId, version: { increment: 1 } },
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'user', id);

    // Send account-approved email when admin activates a previously PENDING user.
    const isBeingApproved =
      existing.status === 'PENDING' &&
      dto.status === 'ACTIVE' &&
      dto.isApproved === true;

    if (isBeingApproved) {
      const fullName = `${existing.firstName} ${existing.lastName}`;
      void this.mailer
        .send(
          existing.email,
          'Your TimeForge Account Has Been Approved',
          [
            `Hello ${fullName},`,
            '',
            'Great news! Your TimeForge account has been reviewed and approved by an administrator.',
            '',
            'You can now sign in to TimeForge using the email address and password you registered with.',
            '',
            'If you have any questions, please reach out to your HR or system administrator.',
            '',
            'Best regards,',
            'The TimeForge Team',
          ].join('\n'),
        )
        .catch((err: unknown) =>
          console.error('[UsersService] Approval email failed silently:', err),
        );
    }

    return this.findOne(caller, id);
  }

  /** Explicit approval orchestration — sets ACTIVE, notifies the employee, audits. */
  async approve(caller: AuthPrincipal, id: string, dto: ApproveUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId: caller.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    if (existing.status !== 'PENDING') throw new ConflictException('Only pending accounts can be approved');

    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        isApproved: true,
        updatedBy: caller.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'user', id);
    await this.notifications.create(caller.tenantId, id, 'APPROVAL_DECISION', {
      decision: 'APPROVED',
    });

    const fullName = `${existing.firstName} ${existing.lastName}`;
    void this.mailer
      .send(
        existing.email,
        'Your TimeForge Account Has Been Approved',
        [
          `Hello ${fullName},`,
          '',
          'Great news! Your TimeForge account has been reviewed and approved by an administrator.',
          '',
          'You can now sign in to TimeForge using the email address and password you registered with.',
          '',
          'If you have any questions, please reach out to your HR or system administrator.',
          '',
          'Best regards,',
          'The TimeForge Team',
        ].join('\n'),
      )
      .catch((err: unknown) => console.error('[UsersService] Approval email failed silently:', err));

    return this.findOne(caller, id);
  }

  /** Explicit rejection orchestration — sets REJECTED, notifies the employee, audits. */
  async reject(caller: AuthPrincipal, id: string, dto: RejectUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId: caller.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    if (existing.status !== 'PENDING') throw new ConflictException('Only pending accounts can be rejected');

    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.REJECTED,
        isApproved: false,
        rejectedAt: new Date(),
        rejectionReason: dto.reason ?? null,
        updatedBy: caller.userId,
        version: { increment: 1 },
      },
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'user', id);
    await this.notifications.create(caller.tenantId, id, 'APPROVAL_DECISION', {
      decision: 'REJECTED',
      reason: dto.reason ?? null,
    });

    const fullName = `${existing.firstName} ${existing.lastName}`;
    void this.mailer
      .send(
        existing.email,
        'Your TimeForge Registration Update',
        [
          `Hello ${fullName},`,
          '',
          'Thank you for your interest in TimeForge. After review, your registration was not approved at this time.',
          ...(dto.reason ? ['', `Reason: ${dto.reason}`] : []),
          '',
          'If you believe this is a mistake, please contact your administrator.',
          '',
          'Best regards,',
          'The TimeForge Team',
        ].join('\n'),
      )
      .catch((err: unknown) => console.error('[UsersService] Rejection email failed silently:', err));

    return this.findOne(caller, id);
  }

  async updateMe(caller: AuthPrincipal, dto: UpdateMeDto) {
    await this.prisma.user.update({
      where: { id: caller.userId },
      data: { ...dto, updatedBy: caller.userId, version: { increment: 1 } },
    });
    return this.findMe(caller);
  }

  async deactivate(caller: AuthPrincipal, id: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId: caller.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.DEACTIVATED, updatedBy: caller.userId, version: { increment: 1 } },
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'user', id);
  }

  async assignRoles(caller: AuthPrincipal, userId: string, dto: AssignRolesDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId: caller.tenantId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    const roles = await this.prisma.role.findMany({
      where: { tenantId: caller.tenantId, key: { in: dto.roles } },
    });
    if (roles.length !== dto.roles.length) {
      throw new NotFoundException('One or more roles not found');
    }

    await this.prisma.userRole.deleteMany({ where: { userId } });
    await this.prisma.userRole.createMany({
      data: roles.map((r) => ({ userId, roleId: r.id })),
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.ROLE_CHANGE, 'user', userId);
    return this.findOne(caller, userId);
  }

  private async audit(tenantId: string, actorId: string, action: AuditAction, entityType: string, entityId: string) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action, entityType, entityId } });
  }
}
