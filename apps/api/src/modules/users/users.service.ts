import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction, Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
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
  ChangePasswordDto,
  BulkImportEmployeesDto,
  EmployeesExportQuery,
  PendingAccountsQuery,
} from './dto';
import { MailerService } from '../../infra/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';

type ProfileUser = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } }; department: true; organization: true };
}>;

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
  ) {}

  private isFinanceOrAdmin(user: AuthPrincipal): boolean {
    return user.roles.some((r) => r === 'FINANCE' || r === 'ADMIN') || user.permissions.includes('*');
  }

  private sanitize(user: Record<string, unknown>, caller: AuthPrincipal) {
    const { passwordHash: _hash, ...safe } = user;
    if (!this.isFinanceOrAdmin(caller)) {
      // BR-PAY-06: hourly rate hidden from self / Supervisor / HR
      const { hourlyRate: _rate, ...rest } = safe;
      return rest;
    }
    return safe;
  }

  async findAll(caller: AuthPrincipal, query: UsersListQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const baseWhere: Record<string, unknown> = {
      tenantId: caller.tenantId,
      organizationId: caller.organizationId,
      deletedAt: null,
    };
    if (query.status) baseWhere['status'] = query.status;
    if (query.departmentId) baseWhere['departmentId'] = query.departmentId;
    if (query.teamId) baseWhere['teamId'] = query.teamId;
    if (query.q) {
      baseWhere['OR'] = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // Total reflects status/department/search filters (role is a post-filtered
    // relation below, so it isn't reflected here — matches this endpoint's
    // pre-existing role-filter limitation, not something newly introduced).
    const totalPromise = query.role ? null : this.prisma.user.count({ where: baseWhere });

    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};
    let users = await this.prisma.user.findMany({
      where: { ...baseWhere, ...cursorWhere },
      include: { roles: { include: { role: true } } },
      orderBy: { lastName: 'asc' },
      take: limit + 1,
    });

    // Filter by role key if requested (post-filter — role is a relation)
    if (query.role) {
      users = users.filter((u) => u.roles.some((ur) => ur.role.key === query.role));
    }

    const [page, total] = await Promise.all([Promise.resolve(buildPage(users, limit)), totalPromise]);
    return {
      data: page.data.map((u) => this.sanitize(u as unknown as Record<string, unknown>, caller)),
      page: total !== null ? { ...page.page, total } : page.page,
    };
  }

  async findOne(caller: AuthPrincipal, id: string) {
    // Self read uses user:read_self; others need user:read
    if (id !== caller.userId && !caller.permissions.includes('user:read') && !caller.permissions.includes('*')) {
      throw new ForbiddenException('Missing required permission: user:read');
    }
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: caller.tenantId, deletedAt: null },
      include: { roles: { include: { role: true } }, department: true, organization: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const shaped = await this.shapeProfile(user);
    return this.sanitize(shaped, caller);
  }

  async findMe(caller: AuthPrincipal) {
    return this.findOne(caller, caller.userId);
  }

  /** Flattens department/organization to {id, name} and swaps the raw storage key for a signed avatar URL. */
  private async shapeProfile(user: ProfileUser): Promise<Record<string, unknown>> {
    const { avatarKey, department, organization, ...rest } = user;
    const avatarUrl = avatarKey ? await this.storage.signedUrl(avatarKey) : null;
    return {
      ...rest,
      department: department ? { id: department.id, name: department.name } : null,
      organization: { id: organization.id, name: organization.name },
      avatarUrl,
    };
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

  /** Same as create(), but sends a real invitation email — the Employee Management "Invite" action. */
  async invite(caller: AuthPrincipal, dto: CreateUserDto) {
    const created = await this.create(caller, dto);
    const fullName = `${dto.firstName} ${dto.lastName}`;
    void this.mailer
      .send(
        dto.email,
        "You've Been Invited to TimeForge",
        [
          `Hello ${fullName},`,
          '',
          'An administrator has created a TimeForge account for you.',
          '',
          'Visit your organization\'s TimeForge sign-in page and use "Forgot password?" with this email address to set your password and get started.',
          '',
          'Best regards,',
          'The TimeForge Team',
        ].join('\n'),
      )
      .catch((err: unknown) => console.error('[UsersService] Invite email failed silently:', err));
    return created;
  }

  /** Bulk-creates employees (max 100), delegating to create() per item so every
   *  validation/audit rule stays in one place. Mirrors AdminService.bulkImportUsers(). */
  async bulkImport(caller: AuthPrincipal, dto: BulkImportEmployeesDto) {
    const MAX_BULK_SIZE = 100;
    if (dto.users.length > MAX_BULK_SIZE) {
      throw new ConflictException(`Bulk import limited to ${MAX_BULK_SIZE} users per request`);
    }

    const results: { id?: string; status: 'ok' | 'error'; error?: string }[] = [];
    for (const item of dto.users) {
      try {
        const user = await this.create(caller, item);
        results.push({ id: (user as { id: string }).id, status: 'ok' });
      } catch (err: unknown) {
        results.push({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: caller.tenantId,
        actorId: caller.userId,
        action: AuditAction.ADMIN_ACTION,
        entityType: 'bulk_employee_import',
        metadata: {
          total: dto.users.length,
          ok: results.filter((r) => r.status === 'ok').length,
          errors: results.filter((r) => r.status === 'error').length,
        },
      },
    });

    return { results };
  }

  /** CSV export of the employee directory under the same filters as findAll(). Capped at 2000 rows. */
  async exportCsv(caller: AuthPrincipal, query: EmployeesExportQuery): Promise<string> {
    const where: Record<string, unknown> = {
      tenantId: caller.tenantId,
      organizationId: caller.organizationId,
      deletedAt: null,
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
      include: { roles: { include: { role: true } }, department: true },
      orderBy: { lastName: 'asc' },
      take: 2000,
    });
    if (query.role) {
      users = users.filter((u) => u.roles.some((ur) => ur.role.key === query.role));
    }

    await this.audit(caller.tenantId, caller.userId, AuditAction.ADMIN_ACTION, 'employee_export', caller.userId);

    const header = 'First Name,Last Name,Email,Role,Department,Employment Type,Status';
    const lines = users.map((u) =>
      [
        `"${u.firstName}"`,
        `"${u.lastName}"`,
        u.email,
        u.roles.map((r) => r.role.name).join('/') || '—',
        `"${u.department?.name ?? ''}"`,
        u.employmentType,
        u.status,
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  async update(caller: AuthPrincipal, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId: caller.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');

    // Employees can only be assigned to departments within their own organization.
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId: caller.tenantId, organizationId: existing.organizationId, deletedAt: null },
      });
      if (!dept) throw new NotFoundException('Department not found in this organization');
    }

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

    if (dto.departmentId && dto.departmentId !== existing.departmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: dto.departmentId } });
      await this.notifications.create({
        tenantId: caller.tenantId,
        organizationId: existing.organizationId,
        userId: id,
        senderId: caller.userId,
        type: 'DEPARTMENT_CHANGED',
        category: 'ACCOUNT',
        title: 'Department updated',
        message: department ? `You've been moved to the ${department.name} department.` : 'Your department has been updated.',
      });
    }

    return this.findOne(caller, id);
  }

  /** The "Pending Account Approvals" queue — PENDING self-registrations awaiting an Admin decision. */
  async listPendingAccounts(caller: AuthPrincipal, query: PendingAccountsQuery) {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursorWhere = query.cursor ? { id: { gt: decodeCursor(query.cursor) } } : {};
    const where: Record<string, unknown> = {
      tenantId: caller.tenantId,
      organizationId: caller.organizationId,
      status: 'PENDING',
      deletedAt: null,
    };
    if (query.departmentId) where['departmentId'] = query.departmentId;
    if (query.q) {
      where['OR'] = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    let users = await this.prisma.user.findMany({
      where: { ...where, ...cursorWhere },
      include: { roles: { include: { role: true } }, department: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    if (query.role) {
      users = users.filter((u) => u.roles.some((ur) => ur.role.key === query.role));
    }

    const page = buildPage(users, limit);
    return {
      data: page.data.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        jobTitle: u.jobTitle,
        department: u.department,
        role: u.roles[0]?.role ? { key: u.roles[0].role.key, name: u.roles[0].role.name } : null,
        emailVerifiedAt: u.emailVerifiedAt,
        createdAt: u.createdAt,
        version: u.version,
      })),
      page: { ...page.page, total },
    };
  }

  /** Explicit approval orchestration — sets ACTIVE, notifies the employee, audits. */
  async approve(caller: AuthPrincipal, id: string, dto: ApproveUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId: caller.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    if (existing.status !== 'PENDING') throw new ConflictException('Only pending accounts can be approved');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.ACTIVE,
          isApproved: true,
          updatedBy: caller.userId,
          version: { increment: 1 },
        },
      }),
      this.prisma.auditLog.create({
        data: { tenantId: caller.tenantId, actorId: caller.userId, action: AuditAction.ADMIN_ACTION, entityType: 'user', entityId: id },
      }),
    ]);
    await this.notifications.create({
      tenantId: caller.tenantId,
      organizationId: existing.organizationId,
      userId: id,
      senderId: caller.userId,
      type: 'APPROVAL_DECISION',
      category: 'ACCOUNT',
      title: 'Account approved',
      message: 'Your account has been approved by an administrator.',
      metadata: { decision: 'APPROVED' },
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

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.REJECTED,
          isApproved: false,
          rejectedAt: new Date(),
          rejectionReason: dto.reason ?? null,
          updatedBy: caller.userId,
          version: { increment: 1 },
        },
      }),
      this.prisma.auditLog.create({
        data: { tenantId: caller.tenantId, actorId: caller.userId, action: AuditAction.ADMIN_ACTION, entityType: 'user', entityId: id },
      }),
    ]);
    await this.notifications.create({
      tenantId: caller.tenantId,
      organizationId: existing.organizationId,
      userId: id,
      senderId: caller.userId,
      type: 'REJECTION',
      category: 'ACCOUNT',
      title: 'Registration not approved',
      message: dto.reason ? `Reason: ${dto.reason}` : 'Your registration was not approved.',
      metadata: { decision: 'REJECTED', reason: dto.reason ?? null },
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
    let email: string | undefined;
    if (dto.email) {
      email = dto.email.toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: { tenantId: caller.tenantId, email, deletedAt: null, NOT: { id: caller.userId } },
      });
      if (existing) throw new ConflictException('A user with this email already exists');
    }
    await this.prisma.user.update({
      where: { id: caller.userId },
      data: { ...dto, email, updatedBy: caller.userId, version: { increment: 1 } },
    });
    return this.findMe(caller);
  }

  async updateAvatar(
    caller: AuthPrincipal,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ) {
    const previous = await this.prisma.user.findFirst({ where: { id: caller.userId } });
    const { key } = await this.uploads.upload(
      { folder: 'avatars', filename: file.originalname, data: file.buffer, contentType: file.mimetype, size: file.size },
      { maxBytes: AVATAR_MAX_BYTES, allowedMimeTypes: AVATAR_MIME_TYPES },
    );
    await this.prisma.user.update({
      where: { id: caller.userId },
      data: { avatarKey: key, updatedBy: caller.userId, version: { increment: 1 } },
    });
    if (previous?.avatarKey) {
      void this.storage
        .remove(previous.avatarKey)
        .catch((err: unknown) => console.error('[UsersService] Failed to remove old avatar:', err));
    }
    return this.findMe(caller);
  }

  async changePassword(caller: AuthPrincipal, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({ where: { id: caller.userId } });
    if (!user?.passwordHash) throw new NotFoundException('User not found');
    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: caller.userId },
      data: { passwordHash, updatedBy: caller.userId, version: { increment: 1 } },
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.PASSWORD_CHANGE, 'user', caller.userId);
    await this.notifications.create({
      tenantId: caller.tenantId,
      organizationId: caller.organizationId,
      userId: caller.userId,
      type: 'PASSWORD_CHANGED',
      category: 'ACCOUNT',
      title: 'Password changed',
      message: 'Your password was changed successfully.',
    });
  }

  async listSessions(caller: AuthPrincipal) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId: caller.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      device: s.device,
      ip: s.ip,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: Boolean(caller.sessionFamilyId) && s.familyId === caller.sessionFamilyId,
    }));
  }

  /** Revokes every active session except the caller's own — "logout other devices," not a full sign-out. */
  async revokeOtherSessions(caller: AuthPrincipal) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId: caller.userId,
        revokedAt: null,
        ...(caller.sessionFamilyId ? { familyId: { not: caller.sessionFamilyId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    await this.audit(caller.tenantId, caller.userId, AuditAction.LOGOUT, 'user', caller.userId);
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
    await this.notifications.create({
      tenantId: caller.tenantId,
      organizationId: user.organizationId,
      userId,
      senderId: caller.userId,
      type: 'ROLE_CHANGED',
      category: 'ACCOUNT',
      title: 'Role updated',
      message: `Your access role was updated to ${roles.map((r) => r.name).join(', ')}.`,
    });
    return this.findOne(caller, userId);
  }

  private async audit(tenantId: string, actorId: string, action: AuditAction, entityType: string, entityId: string) {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action, entityType, entityId } });
  }
}
