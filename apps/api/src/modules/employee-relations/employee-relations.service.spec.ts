import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeRelationsService } from './employee-relations.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthPrincipal } from '../../common/decorators';

describe('EmployeeRelationsService (BUG-BB)', () => {
  let service: EmployeeRelationsService;
  let prisma: any;
  let notifications: any;

  const mockPrincipal: AuthPrincipal = {
    userId: 'usr-hr-1',
    tenantId: 't-1',
    organizationId: 'org-1',
    roles: ['HR'],
    permissions: ['discipline:create', 'discipline:read_org', 'discipline:respond', 'grievance:read_org', 'clearance:create', 'clearance:read_org', 'clearance:approve'],
  };

  const mockEmployeePrincipal: AuthPrincipal = {
    userId: 'usr-emp-1',
    tenantId: 't-1',
    organizationId: 'org-1',
    roles: ['EMPLOYEE'],
    permissions: ['discipline:read_self', 'discipline:respond', 'grievance:create', 'clearance:read_self'],
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      disciplineRecord: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      grievance: { create: jest.fn(), findMany: jest.fn() },
      clearanceChecklist: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      clearanceItem: { update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    notifications = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeRelationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<EmployeeRelationsService>(EmployeeRelationsService);
  });

  it('should create an NTE and notify employee', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'usr-emp-1' });
    prisma.disciplineRecord.create.mockResolvedValue({
      id: 'nte-1',
      employeeId: 'usr-emp-1',
      title: 'Tardiness',
      status: 'ISSUED',
    });

    const res = await service.createNte(mockPrincipal, {
      employeeId: 'usr-emp-1',
      title: 'Tardiness',
      violationDescription: '3 consecutive tardy arrivals',
    });

    expect(res.id).toBe('nte-1');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-emp-1', title: expect.stringContaining('NTE') }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('should allow employee to respond to their NTE', async () => {
    prisma.disciplineRecord.findFirst.mockResolvedValue({
      id: 'nte-1',
      employeeId: 'usr-emp-1',
      status: 'ISSUED',
    });
    prisma.disciplineRecord.update.mockResolvedValue({
      id: 'nte-1',
      employeeResponse: 'Heavy traffic',
      status: 'RESPONDED',
    });

    const res = await service.respondNte(mockEmployeePrincipal, 'nte-1', { response: 'Heavy traffic' });
    expect(res.status).toBe('RESPONDED');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('should restrict Grievance Inbox to HR/Admin roles', async () => {
    await expect(service.findGrievances(mockEmployeePrincipal)).rejects.toThrow(ForbiddenException);

    prisma.grievance.findMany.mockResolvedValue([{ id: 'g-1', subject: 'Workplace issue' }]);
    const grievances = await service.findGrievances(mockPrincipal);
    expect(grievances).toHaveLength(1);
  });

  it('should initiate clearance checklist and route approvals', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'usr-emp-1' });
    prisma.clearanceChecklist.findFirst.mockResolvedValue(null);
    prisma.clearanceChecklist.create.mockResolvedValue({
      id: 'cl-1',
      employeeId: 'usr-emp-1',
      status: 'PENDING',
      items: [
        { id: 'item-it', department: 'IT', isApproved: false },
        { id: 'item-fin', department: 'FINANCE', isApproved: false },
      ],
    });

    const res = await service.initiateClearance(mockPrincipal, { employeeId: 'usr-emp-1' });
    expect(res.id).toBe('cl-1');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
