import {
  Injectable,
  UnauthorizedException,
  NotImplementedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditAction, EmploymentType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../infra/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto';

import { SecurityService } from '../security/security.service';
import { SecuritySeverity, SecurityStatus } from '@prisma/client';

interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: number;
  refreshTtl: number;
}

interface UserForAuth {
  id: string;
  tenantId: string;
  organizationId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly security: SecurityService,
  ) {}

  private jwtCfg(): JwtConfig {
    return this.config.get<JwtConfig>('jwt')!;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async login(email: string, password: string, ip?: string, device?: string) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
      include: { roles: { include: { role: true } } },
    });

    const clientIp = ip || 'unknown';

    // 1. Check lockout status
    if (user && user.lockoutUntil && user.lockoutUntil > new Date()) {
      await this.security.logEvent(
        user.tenantId,
        user.organizationId,
        user.id,
        'LOGIN_LOCKED_ATTEMPT',
        SecurityStatus.DENIED,
        SecuritySeverity.HIGH,
        clientIp,
        { email: normalizedEmail, device },
      );
      const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked due to multiple failed login attempts. Try again in ${minutesLeft} minutes.`,
      );
    }

    if (!user || !user.passwordHash) {
      // Log failed attempt for non-existent user (use a dummy tenant/org or skip database constraint)
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException(
        'Your account is awaiting administrator approval. Please check your email for updates.',
      );
    }
    if (user.status === 'REJECTED') {
      throw new UnauthorizedException(
        'Your account registration was not approved. Please contact your administrator.',
      );
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      // Increment failed login count
      const attempts = user.failedLoginAttempts + 1;
      const lockoutUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts >= 5 ? 0 : attempts, // Reset count on lockout to allow retry later
          lockoutUntil,
        },
      });

      if (attempts >= 5) {
        await this.security.logEvent(
          user.tenantId,
          user.organizationId,
          user.id,
          'LOGIN_LOCKOUT',
          SecurityStatus.DENIED,
          SecuritySeverity.CRITICAL,
          clientIp,
          { email: normalizedEmail, attempts, device },
        );
        await this.security.createAlert(
          user.tenantId,
          user.organizationId,
          'Multiple Failed Login Attempts',
          `IP ${clientIp} attempted access 5 times on user ${user.email} triggering a 30-minute lockout.`,
          SecuritySeverity.CRITICAL,
          user.id,
          clientIp,
        );
      } else {
        await this.security.logEvent(
          user.tenantId,
          user.organizationId,
          user.id,
          'LOGIN_FAILED',
          SecurityStatus.DENIED,
          SecuritySeverity.MEDIUM,
          clientIp,
          { email: normalizedEmail, attempts, device },
        );
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerifiedAt) throw new UnauthorizedException('Email not verified');

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      });
    }

    const roleKeys = user.roles.map((ur) => ur.role.key);
    const tokens = await this.issueTokens(user, roleKeys, ip, device);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit(user.tenantId, user.id, AuditAction.LOGIN);
    
    // Log successful security event
    await this.security.logEvent(
      user.tenantId,
      user.organizationId,
      user.id,
      'LOGIN_SUCCESS',
      SecurityStatus.SUCCESS,
      SecuritySeverity.INFO,
      clientIp,
      { email: normalizedEmail, device },
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        roles: roleKeys,
        organizationId: user.organizationId,
      },
    };
  }

  private async issueTokens(
    user: UserForAuth,
    roleKeys: string[],
    ip?: string,
    device?: string,
    familyId?: string,
  ) {
    const cfg = this.jwtCfg();
    const fid = familyId ?? randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, tid: user.tenantId, oid: user.organizationId, roles: roleKeys, fid },
      { secret: cfg.accessSecret, expiresIn: cfg.accessTtl },
    );

    const rawRefresh = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: this.sha256(rawRefresh),
        familyId: fid,
        device: device ?? null,
        ip: ip ?? null,
        expiresAt: new Date(Date.now() + cfg.refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken: rawRefresh, expiresIn: cfg.accessTtl };
  }

  async refresh(rawRefresh: string | undefined, ip?: string) {
    if (!rawRefresh) throw new UnauthorizedException('Missing refresh token');
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.sha256(rawRefresh) },
    });
    if (!existing) throw new UnauthorizedException('Invalid refresh token');

    // Reuse detection: a revoked token presented again → revoke the whole family.
    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (existing.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    // Rotate.
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findFirst({
      where: { id: existing.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const roleKeys = user.roles.map((ur) => ur.role.key);
    return this.issueTokens(user, roleKeys, ip, existing.device ?? undefined, existing.familyId);
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.sha256(rawRefresh) },
    });
    if (existing && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      await this.audit(existing.tenantId, existing.userId, AuditAction.LOGOUT);
    }
  }

  // Public self-service signup. Creates an INVITED user pending admin approval;
  // never issues tokens. Email verification has no working pipeline yet, so we
  // mark the address verified here — admin approval (status -> ACTIVE) is the
  // only real gate.
  async register(dto: RegisterDto): Promise<void> {
    const { defaultTenantSlug, defaultOrgSlug } = this.config.get<{
      defaultTenantSlug: string;
      defaultOrgSlug: string;
    }>('registration')!;

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: defaultTenantSlug } });
    if (!tenant) throw new NotFoundException('Registration is not available');

    const org = await this.prisma.organization.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: defaultOrgSlug } },
    });
    if (!org) throw new NotFoundException('Registration is not available');

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email, deletedAt: null },
    });
    if (existing) throw new ConflictException('A user with this email already exists');

    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, tenantId: tenant.id, organizationId: org.id, deletedAt: null },
    });
    if (!department) throw new NotFoundException('Department not found');

    const role = await this.prisma.role.findFirst({ where: { tenantId: tenant.id, key: 'EMPLOYEE' } });
    if (!role) throw new NotFoundException("Role 'EMPLOYEE' not found");

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        organizationId: org.id,
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        jobTitle: dto.jobTitle,
        departmentId: department.id,
        employmentType: EmploymentType.EMPLOYEE,
        status: UserStatus.PENDING,
        isApproved: false,
        emailVerifiedAt: new Date(),
      },
    });
    await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await this.audit(tenant.id, user.id, AuditAction.ADMIN_ACTION);

    // Notify org admins of the new pending registration (in-app; failure must not roll back registration).
    void this.notifyAdminsOfPendingRegistration(tenant.id, org.id, user.id, dto).catch((err: unknown) =>
      console.error('[AuthService] Admin notification failed silently:', err),
    );

    // Send welcome email asynchronously — failure must NOT roll back account creation.
    const fullName = `${dto.firstName} ${dto.lastName}`;
    void this.mailer
      .send(
        email,
        'Welcome to TimeForge – Registration Received',
        [
          `Hello ${fullName},`,
          '',
          'Thank you for registering with TimeForge!',
          '',
          'Your account has been created successfully and is currently pending administrator approval.',
          'You will receive another email as soon as your account is approved and ready to use.',
          '',
          'If you did not create this account, please ignore this email.',
          '',
          'Best regards,',
          'The TimeForge Team',
        ].join('\n'),
      )
      .catch((err: unknown) =>
        // Log but do not propagate — email failure must not affect registration response
        console.error('[AuthService] Welcome email failed silently:', err),
      );
  }

  // Public department list for the signup form's department picker, scoped to
  // the single default org this MVP registers new users into.
  async departmentsForRegistration(): Promise<{ id: string; name: string }[]> {
    const { defaultTenantSlug, defaultOrgSlug } = this.config.get<{
      defaultTenantSlug: string;
      defaultOrgSlug: string;
    }>('registration')!;

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: defaultTenantSlug } });
    if (!tenant) return [];
    const org = await this.prisma.organization.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: defaultOrgSlug } },
    });
    if (!org) return [];

    const departments = await this.prisma.department.findMany({
      where: { tenantId: tenant.id, organizationId: org.id, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return departments;
  }

  // Email verification / password reset: token plumbing lands with the Users
  // module in Phase 6; the contracts exist here so the routes are wired.
  async forgotPassword(_email: string): Promise<void> {
    return;
  }

  async resetPassword(_token: string, _password: string): Promise<void> {
    throw new NotImplementedException('Password reset is implemented with the Users module (Phase 6)');
  }

  async verifyEmail(_token: string): Promise<void> {
    throw new NotImplementedException('Email verification is implemented with the Users module (Phase 6)');
  }

  private async audit(tenantId: string, actorId: string, action: AuditAction): Promise<void> {
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action } });
  }

  private async notifyAdminsOfPendingRegistration(
    tenantId: string,
    organizationId: string,
    pendingUserId: string,
    dto: RegisterDto,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId,
        organizationId,
        deletedAt: null,
        roles: { some: { role: { key: 'ADMIN' } } },
      },
      select: { id: true },
    });
    const fullName = `${dto.firstName} ${dto.lastName}`;
    await Promise.all(
      admins.map((admin) =>
        this.notifications.create({
          tenantId,
          organizationId,
          userId: admin.id,
          type: 'EMPLOYEE_APPROVAL_REQUEST',
          category: 'ACCOUNT',
          priority: 'HIGH',
          title: 'New employee awaiting approval',
          message: `${fullName} registered and is awaiting approval.`,
          metadata: { userId: pendingUserId, name: fullName, email: dto.email.toLowerCase() },
        }),
      ),
    );
  }
}
