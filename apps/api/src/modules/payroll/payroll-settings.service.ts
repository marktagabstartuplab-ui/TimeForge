import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import { UpdatePayrollSettingsDto } from './dto';

/** Plain-number view of payroll_settings, for arithmetic in the deduction engine. */
export interface ResolvedPayrollSettings {
  sssEmployeeRate: number;
  sssEmployerRate: number;
  sssSalaryCeiling: number;
  philhealthEmployeeRate: number;
  philhealthEmployerRate: number;
  philhealthMin: number;
  philhealthMax: number;
  pagibigEmployeeRateLow: number;
  pagibigEmployeeRateHigh: number;
  pagibigEmployerRate: number;
  pagibigSalaryThreshold: number;
  pagibigEmployeeCap: number;
  nightShiftPremium: number;
  nightShiftStartHour: number;
  nightShiftEndHour: number;
  regularHolidayWorkedRate: number;
  regularHolidayUnworkedRate: number;
  specialHolidayWorkedRate: number;
  thirteenthMonthExemptionCap: number;
  birTaxTableYear: number;
}

/** 2026 statutory defaults — mirrors the column defaults in payroll_settings. */
export const DEFAULT_PAYROLL_SETTINGS: ResolvedPayrollSettings = {
  sssEmployeeRate: 0.05,
  sssEmployerRate: 0.1,
  sssSalaryCeiling: 29_500,
  philhealthEmployeeRate: 0.025,
  philhealthEmployerRate: 0.025,
  philhealthMin: 500,
  philhealthMax: 5_000,
  pagibigEmployeeRateLow: 0.01,
  pagibigEmployeeRateHigh: 0.02,
  pagibigEmployerRate: 0.02,
  pagibigSalaryThreshold: 1_500,
  pagibigEmployeeCap: 200,
  nightShiftPremium: 1.1,
  nightShiftStartHour: 22,
  nightShiftEndHour: 6,
  regularHolidayWorkedRate: 2,
  regularHolidayUnworkedRate: 1,
  specialHolidayWorkedRate: 1.3,
  thirteenthMonthExemptionCap: 90_000,
  birTaxTableYear: 2026,
};

/**
 * Reads and writes an organization's statutory payroll configuration.
 *
 * An org that has no row yet (created before FEAT-3, or created by a code path
 * that does not seed one) resolves to the 2026 defaults rather than erroring —
 * a missing settings row must not be able to block a payroll run.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrganization(tenantId: string, organizationId: string): Promise<ResolvedPayrollSettings> {
    const row = await this.prisma.payrollSettings.findFirst({
      where: { tenantId, organizationId, deletedAt: null },
    });
    if (!row) return { ...DEFAULT_PAYROLL_SETTINGS };

    return {
      sssEmployeeRate: Number(row.sssEmployeeRate),
      sssEmployerRate: Number(row.sssEmployerRate),
      sssSalaryCeiling: Number(row.sssSalaryCeiling),
      philhealthEmployeeRate: Number(row.philhealthEmployeeRate),
      philhealthEmployerRate: Number(row.philhealthEmployerRate),
      philhealthMin: Number(row.philhealthMin),
      philhealthMax: Number(row.philhealthMax),
      pagibigEmployeeRateLow: Number(row.pagibigEmployeeRateLow),
      pagibigEmployeeRateHigh: Number(row.pagibigEmployeeRateHigh),
      pagibigEmployerRate: Number(row.pagibigEmployerRate),
      pagibigSalaryThreshold: Number(row.pagibigSalaryThreshold),
      pagibigEmployeeCap: Number(row.pagibigEmployeeCap),
      nightShiftPremium: Number(row.nightShiftPremium),
      nightShiftStartHour: row.nightShiftStartHour,
      nightShiftEndHour: row.nightShiftEndHour,
      regularHolidayWorkedRate: Number(row.regularHolidayWorkedRate),
      regularHolidayUnworkedRate: Number(row.regularHolidayUnworkedRate),
      specialHolidayWorkedRate: Number(row.specialHolidayWorkedRate),
      thirteenthMonthExemptionCap: Number(row.thirteenthMonthExemptionCap),
      birTaxTableYear: row.birTaxTableYear,
    };
  }

  forPrincipal(p: AuthPrincipal): Promise<ResolvedPayrollSettings> {
    return this.forOrganization(p.tenantId, p.organizationId);
  }

  /**
   * Read the raw row for the settings screen.
   *
   * Deliberately does NOT create a row when one is missing: this is served by a
   * GET that read-only callers (HR holds payroll_rate:read but not :update) can
   * reach, and a GET that writes would let a viewer mutate the database. An org
   * with no row yet gets the unsaved 2026 defaults, which is exactly what the
   * payroll engine would use for it anyway; the first PATCH persists them.
   */
  async get(p: AuthPrincipal) {
    const existing = await this.prisma.payrollSettings.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
    });
    if (existing) return existing;

    return {
      id: null,
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      ...DEFAULT_PAYROLL_SETTINGS,
      version: 0,
      persisted: false,
    };
  }

  async update(p: AuthPrincipal, dto: UpdatePayrollSettingsDto) {
    const existing = await this.prisma.payrollSettings.findFirst({
      where: { tenantId: p.tenantId, organizationId: p.organizationId, deletedAt: null },
      select: { id: true },
    });

    // First write for an org that predates its settings row materializes it with
    // the 2026 defaults, then applies the change on top.
    if (!existing) {
      return this.prisma.payrollSettings.create({
        data: {
          tenantId: p.tenantId,
          organizationId: p.organizationId,
          ...dto,
          createdBy: p.userId,
          updatedBy: p.userId,
        },
      });
    }

    return this.prisma.payrollSettings.update({
      where: { id: existing.id },
      data: { ...dto, updatedBy: p.userId, version: { increment: 1 } },
    });
  }
}
