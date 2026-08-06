import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompensationBenefitsService } from './compensation-benefits.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { capDeMinimisAmount, DE_MINIMIS_RULES } from './de-minimis';

describe('CompensationBenefitsService (BUG-BC)', () => {
  let service: CompensationBenefitsService;
  let prisma: any;

  const hr: AuthPrincipal = {
    userId: 'usr-hr-1',
    tenantId: 't-1',
    organizationId: 'org-1',
    roles: ['HR'],
    permissions: ['compensation:read', 'compensation:manage'],
  };

  const employee = (id: string, lastName: string) => ({
    id,
    firstName: 'Test',
    lastName,
    email: `${id}@demo.test`,
    jobTitle: null,
    department: null,
  });

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      payrollLineItem: { findMany: jest.fn() },
      deMinimisBenefit: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompensationBenefitsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CompensationBenefitsService);
  });

  // ── (a)(b) 13th-month tracker ───────────────────────────────────────────────

  it('aggregates Jan 1 - Dec 31 basic salary and derives 13th-month as YTD / 12', async () => {
    // 12 monthly periods of ₱20,000 basic salary = ₱240,000 YTD.
    prisma.payrollLineItem.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, month) => ({
        userId: 'usr-emp-1',
        regularPay: 20000,
        payrollReport: { period: { startDate: new Date(Date.UTC(2026, month, 1)) } },
        user: employee('usr-emp-1', 'Santos'),
      })),
    );

    const report = await service.getThirteenthMonthTracker(hr, { year: 2026 });

    expect(report.year).toBe(2026);
    expect(report.headcount).toBe(1);
    expect(report.employees[0].ytdBasicSalary).toBe(240000);
    expect(report.employees[0].monthsWithEarnings).toBe(12);
    expect(report.employees[0].thirteenthMonthPay).toBe(20000);
    expect(report.totalThirteenthMonthPay).toBe(20000);
  });

  it('excludes prior 13th-month runs from the basic-salary aggregate', async () => {
    prisma.payrollLineItem.findMany.mockResolvedValue([]);
    await service.getThirteenthMonthTracker(hr, { year: 2026 });

    expect(prisma.payrollLineItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isThirteenthMonth: false }),
      }),
    );
  });

  it('prorates a partial year rather than assuming a full 12 months of pay', async () => {
    // Six months at ₱30,000 — the payout is 180,000/12, not the monthly salary.
    prisma.payrollLineItem.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, month) => ({
        userId: 'usr-emp-2',
        regularPay: 30000,
        payrollReport: { period: { startDate: new Date(Date.UTC(2026, month, 1)) } },
        user: employee('usr-emp-2', 'Cruz'),
      })),
    );

    const report = await service.getThirteenthMonthTracker(hr, { year: 2026 });
    expect(report.employees[0].ytdBasicSalary).toBe(180000);
    expect(report.employees[0].thirteenthMonthPay).toBe(15000);
  });

  // ── (c)(d)(g) De minimis assignment and BIR capping ─────────────────────────

  it('accepts a rice subsidy within the BIR ceiling unchanged', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'usr-emp-1' });
    prisma.deMinimisBenefit.findFirst.mockResolvedValue(null);
    prisma.deMinimisBenefit.create.mockImplementation(({ data }: any) => ({ id: 'dm-1', ...data }));

    const res = await service.assignDeMinimis(hr, {
      employeeId: 'usr-emp-1',
      benefitType: 'RICE_SUBSIDY' as any,
      monthlyAmount: 1500,
    });

    expect(Number(res.monthlyAmount)).toBe(1500);
    expect(res.wasCapped).toBe(false);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('caps an over-ceiling assignment at the BIR limit and records the request', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'usr-emp-1' });
    prisma.deMinimisBenefit.findFirst.mockResolvedValue(null);
    prisma.deMinimisBenefit.create.mockImplementation(({ data }: any) => ({ id: 'dm-2', ...data }));

    const res = await service.assignDeMinimis(hr, {
      employeeId: 'usr-emp-1',
      benefitType: 'RICE_SUBSIDY' as any,
      monthlyAmount: 5000,
    });

    expect(Number(res.monthlyAmount)).toBe(DE_MINIMIS_RULES.RICE_SUBSIDY.monthlyCap);
    expect(Number(res.requestedAmount)).toBe(5000);
    expect(res.wasCapped).toBe(true);
  });

  it('amends the existing row when the same benefit is re-assigned', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'usr-emp-1' });
    prisma.deMinimisBenefit.findFirst.mockResolvedValue({ id: 'dm-existing' });
    prisma.deMinimisBenefit.update.mockImplementation(({ data }: any) => ({ id: 'dm-existing', ...data }));

    const res = await service.assignDeMinimis(hr, {
      employeeId: 'usr-emp-1',
      benefitType: 'LAUNDRY_ALLOWANCE' as any,
      monthlyAmount: 300,
    });

    expect(res.id).toBe('dm-existing');
    expect(prisma.deMinimisBenefit.create).not.toHaveBeenCalled();
  });

  it('rejects an assignment for an employee outside the caller tenant', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.assignDeMinimis(hr, {
        employeeId: 'usr-other-tenant',
        benefitType: 'RICE_SUBSIDY' as any,
        monthlyAmount: 1000,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('leaves benefits with no statutory peso ceiling uncapped', () => {
    const { amount, cap, wasCapped } = capDeMinimisAmount('MEAL_ALLOWANCE' as any, 99999);
    expect(cap).toBeNull();
    expect(amount).toBe(99999);
    expect(wasCapped).toBe(false);
  });

  // ── (e)(g) Period proration feeding payroll ─────────────────────────────────

  it('sums multiple benefits per employee and halves them for a semi-monthly run', async () => {
    prisma.deMinimisBenefit.findMany.mockResolvedValue([
      { employeeId: 'usr-emp-1', monthlyAmount: 1500 },
      { employeeId: 'usr-emp-1', monthlyAmount: 300 },
      { employeeId: 'usr-emp-2', monthlyAmount: 500 },
    ]);

    const totals = await service.deMinimisTotalsForPeriod('t-1', 'org-1', ['usr-emp-1', 'usr-emp-2'], 2);

    expect(totals.get('usr-emp-1')).toBe(900); // (1500 + 300) / 2
    expect(totals.get('usr-emp-2')).toBe(250);
  });

  it('returns an empty map without querying when there are no eligible users', async () => {
    const totals = await service.deMinimisTotalsForPeriod('t-1', 'org-1', [], 1);
    expect(totals.size).toBe(0);
    expect(prisma.deMinimisBenefit.findMany).not.toHaveBeenCalled();
  });
});
