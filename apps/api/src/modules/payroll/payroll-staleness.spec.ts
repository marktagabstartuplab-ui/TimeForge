import { PayrollService } from './payroll.service';
import { AuthPrincipal } from '../../common/decorators';

/**
 * BUG-BR — approving a timesheet does not recalculate payroll, and nothing said
 * so. This is the read the Payroll Processing screen uses to show that its
 * report predates the approvals feeding it.
 */

const principal = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  roles: ['FINANCE'],
  permissions: [],
} as unknown as AuthPrincipal;

const PERIOD = {
  id: 'period-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  startDate: new Date('2026-08-01T00:00:00Z'),
  endDate: new Date('2026-08-15T00:00:00Z'),
};

/**
 * The service is constructed directly rather than through the Nest container:
 * periodStaleness touches only Prisma and findOnePeriod, and the full provider
 * list (queues, mailer, storage, exports) is noise for that.
 */
function buildService(opts: {
  report?: { createdAt: Date } | null;
  timesheets?: { decidedAt: Date | null; updatedAt: Date }[];
}) {
  const prisma = {
    payrollReport: { findFirst: jest.fn().mockResolvedValue(opts.report ?? null) },
    timesheet: { findMany: jest.fn().mockResolvedValue(opts.timesheets ?? []) },
  };

  const service = Object.create(PayrollService.prototype) as PayrollService;
  Object.assign(service, { prisma });
  // findOnePeriod does the tenant scoping/404 and is exercised elsewhere.
  (service as unknown as { findOnePeriod: unknown }).findOnePeriod = jest
    .fn()
    .mockResolvedValue(PERIOD);

  return { service, prisma };
}

const APPROVED_AT = new Date('2026-08-05T07:02:57Z');
const GENERATED_BEFORE = new Date('2026-08-05T02:40:21Z');
const GENERATED_AFTER = new Date('2026-08-05T09:00:00Z');

describe('BUG-BR — payroll period staleness', () => {
  // The exact shape of the reported bug: a sheet approved 4h22m after the
  // report was generated showed as 0 hours, with nothing on screen to explain it.
  it('is stale when a timesheet was approved after the report was generated', async () => {
    const { service } = buildService({
      report: { createdAt: GENERATED_BEFORE },
      timesheets: [{ decidedAt: APPROVED_AT, updatedAt: APPROVED_AT }],
    });

    const result = await service.periodStaleness(principal, 'period-1');

    expect(result.isStale).toBe(true);
    expect(result.lastRecalculatedAt).toEqual(GENERATED_BEFORE);
    expect(result.latestApprovalAt).toEqual(APPROVED_AT);
    expect(result.payableTimesheetCount).toBe(1);
  });

  it('is not stale when the report is newer than every approval', async () => {
    const { service } = buildService({
      report: { createdAt: GENERATED_AFTER },
      timesheets: [{ decidedAt: APPROVED_AT, updatedAt: APPROVED_AT }],
    });

    expect((await service.periodStaleness(principal, 'period-1')).isStale).toBe(false);
  });

  // "No report generated yet" with approved work waiting is the same problem.
  it('is stale when no report exists but approved timesheets are waiting', async () => {
    const { service } = buildService({
      report: null,
      timesheets: [{ decidedAt: APPROVED_AT, updatedAt: APPROVED_AT }],
    });

    const result = await service.periodStaleness(principal, 'period-1');

    expect(result.isStale).toBe(true);
    expect(result.lastRecalculatedAt).toBeNull();
  });

  // An empty period must not nag — there is nothing a recalculation would add.
  it('is not stale when there is nothing to pay', async () => {
    const { service } = buildService({ report: null, timesheets: [] });

    const result = await service.periodStaleness(principal, 'period-1');

    expect(result.isStale).toBe(false);
    expect(result.latestApprovalAt).toBeNull();
    expect(result.payableTimesheetCount).toBe(0);
  });

  it('reports the most recent approval when several exist', async () => {
    const later = new Date('2026-08-06T10:00:00Z');
    const { service } = buildService({
      report: { createdAt: GENERATED_BEFORE },
      timesheets: [
        { decidedAt: APPROVED_AT, updatedAt: APPROVED_AT },
        { decidedAt: later, updatedAt: later },
        { decidedAt: new Date('2026-08-04T00:00:00Z'), updatedAt: new Date('2026-08-04T00:00:00Z') },
      ],
    });

    expect((await service.periodStaleness(principal, 'period-1')).latestApprovalAt).toEqual(later);
  });

  // Rows predating decidedAt being populated still have to be judged.
  it('falls back to updatedAt when decidedAt is null', async () => {
    const { service } = buildService({
      report: { createdAt: GENERATED_BEFORE },
      timesheets: [{ decidedAt: null, updatedAt: APPROVED_AT }],
    });

    const result = await service.periodStaleness(principal, 'period-1');

    expect(result.latestApprovalAt).toEqual(APPROVED_AT);
    expect(result.isStale).toBe(true);
  });

  // The banner must describe the run it offers, so it asks with the same
  // predicate generation uses — including the BUG-BL period link.
  it('counts exactly what a generation run would pay', async () => {
    const { service, prisma } = buildService({ report: null, timesheets: [] });

    await service.periodStaleness(principal, 'period-1');

    const [args] = prisma.timesheet.findMany.mock.calls[0];
    expect(args.where.status).toEqual({ in: ['APPROVED', 'PAYROLL_READY'] });
    expect(args.where.paymentStatus).toEqual({ not: 'PAID' });
    expect(args.where.OR).toEqual([
      { payrollPeriodId: 'period-1' },
      {
        payrollPeriodId: null,
        periodStart: { gte: PERIOD.startDate },
        periodEnd: { lte: PERIOD.endDate },
      },
    ]);
  });
});
