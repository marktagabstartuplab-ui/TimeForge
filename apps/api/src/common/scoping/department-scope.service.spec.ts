import { DepartmentScopeService } from './department-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthPrincipal } from '../decorators';

const principal = (over: Partial<AuthPrincipal> = {}): AuthPrincipal =>
  ({
    userId: 'sup-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    roles: ['SUPERVISOR'],
    permissions: ['dashboard:read_team'],
    ...over,
  }) as AuthPrincipal;

describe('DepartmentScopeService', () => {
  let prisma: { department: { findMany: jest.Mock }; user: { findMany: jest.Mock } };
  let svc: DepartmentScopeService;

  beforeEach(() => {
    prisma = {
      department: { findMany: jest.fn() },
      user: { findMany: jest.fn() },
    };
    svc = new DepartmentScopeService(prisma as unknown as PrismaService);
  });

  it('managedDepartmentIds queries by managerId + tenant/org, soft-delete aware', async () => {
    prisma.department.findMany.mockResolvedValue([{ id: 'dept-eng' }, { id: 'dept-ops' }]);

    const ids = await svc.managedDepartmentIds(principal());

    expect(ids).toEqual(['dept-eng', 'dept-ops']);
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', organizationId: 'org-1', managerId: 'sup-1', deletedAt: null },
      select: { id: true },
    });
  });

  it('teamUserIds returns department members plus self (deduped)', async () => {
    prisma.department.findMany.mockResolvedValue([{ id: 'dept-eng' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'sup-1' }, { id: 'emp-1' }, { id: 'emp-2' }]);

    const ids = await svc.teamUserIds(principal());

    expect(new Set(ids)).toEqual(new Set(['sup-1', 'emp-1', 'emp-2']));
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        departmentId: { in: ['dept-eng'] },
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('teamUserIds returns only [self] when the supervisor heads no department', async () => {
    prisma.department.findMany.mockResolvedValue([]);

    const ids = await svc.teamUserIds(principal());

    expect(ids).toEqual(['sup-1']);
    expect(prisma.user.findMany).not.toHaveBeenCalled(); // no department => no member query
  });

  it('canAccessUser: always true for self', async () => {
    prisma.department.findMany.mockResolvedValue([]);
    expect(await svc.canAccessUser(principal(), 'sup-1')).toBe(true);
  });

  it('canAccessUser: true for a department member, false for an outsider', async () => {
    prisma.department.findMany.mockResolvedValue([{ id: 'dept-eng' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'sup-1' }, { id: 'emp-1' }]);

    expect(await svc.canAccessUser(principal(), 'emp-1')).toBe(true);
    expect(await svc.canAccessUser(principal(), 'outsider')).toBe(false);
  });

  describe('departmentHeadId', () => {
    it("returns the department's managerId, tenant/org scoped", async () => {
      (prisma.department as unknown as { findFirst: jest.Mock }).findFirst = jest
        .fn()
        .mockResolvedValue({ managerId: 'head-1' });

      const head = await svc.departmentHeadId('tenant-1', 'org-1', 'dept-eng');

      expect(head).toBe('head-1');
      expect((prisma.department as unknown as { findFirst: jest.Mock }).findFirst).toHaveBeenCalledWith({
        where: { id: 'dept-eng', tenantId: 'tenant-1', organizationId: 'org-1', deletedAt: null },
        select: { managerId: true },
      });
    });

    it('returns null when the department is missing or has no head', async () => {
      (prisma.department as unknown as { findFirst: jest.Mock }).findFirst = jest.fn().mockResolvedValue(null);
      expect(await svc.departmentHeadId('tenant-1', 'org-1', 'missing')).toBeNull();
    });
  });
});
