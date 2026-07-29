import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../infra/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadService } from '../storage/upload.service';
import { StorageService } from '../storage/storage.service';
import { DepartmentScopeService } from '../../common/scoping/department-scope.service';
import { AuthPrincipal } from '../../common/decorators';

const admin = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  roles: ['ADMIN'],
  permissions: ['user:deactivate'],
} as unknown as AuthPrincipal;

const baseUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  email: 'employee@demo.test',
  status: 'DEACTIVATED',
  version: 4,
  deletedAt: null,
};

describe('UsersService.reactivate', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: { send: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: UploadService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: DepartmentScopeService, useValue: {} },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('restores a deactivated account to ACTIVE and bumps its version', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);

    await service.reactivate(admin, 'user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: 'ACTIVE', updatedBy: 'admin-1', version: { increment: 1 } },
    });
  });

  it('writes an audit row for the reactivation', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);

    await service.reactivate(admin, 'user-1');

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        action: 'ADMIN_ACTION',
        entityType: 'user',
        entityId: 'user-1',
      },
    });
  });

  it('scopes the lookup to the caller tenant and excludes soft-deleted users', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);

    await service.reactivate(admin, 'user-1');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'tenant-1', deletedAt: null },
    });
  });

  it('is idempotent — an already-ACTIVE account is left untouched', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...baseUser, status: 'ACTIVE' });

    await expect(service.reactivate(admin, 'user-1')).resolves.toBeUndefined();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  // The guard exists so reactivate can't be used as a back door around admin
  // approval (PENDING/REJECTED) or a suspension.
  it.each(['PENDING', 'REJECTED', 'INVITED', 'SUSPENDED'])('refuses to reactivate a %s account', async (status) => {
    prisma.user.findFirst.mockResolvedValue({ ...baseUser, status });

    await expect(service.reactivate(admin, 'user-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('404s when the user is not in the caller tenant', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.reactivate(admin, 'user-1')).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
