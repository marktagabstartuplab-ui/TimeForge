import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthPrincipal } from '../decorators';

/** Organization setting holding the overtime configuration. */
export const OVERTIME_SETTING_KEY = 'payroll.overtime';

/**
 * Philippine Labor Code minimum: overtime is paid at 125% of the hourly rate.
 * Used when an organization has never configured its own rate — this was the
 * hardcoded value everywhere before BUG-AQ, so existing tenants keep their
 * current payroll behaviour until an admin changes it.
 */
export const DEFAULT_OVERTIME_MULTIPLIER = 1.25;

/** Below 1.0 overtime would pay less than regular time; above 3.0 is a typo. */
export const MIN_OVERTIME_MULTIPLIER = 1;
export const MAX_OVERTIME_MULTIPLIER = 3;

/**
 * Resolves the overtime pay multiplier for an organization (BUG-AQ).
 *
 * Stored on the existing `payroll.overtime` organization setting alongside
 * `dailyThresholdHours`, so no schema change is involved. Deliberately
 * uncached: an admin who changes the rate and immediately regenerates payroll
 * should see the new figure, and this is only read on payroll/report paths.
 */
@Injectable()
export class OvertimeRateService {
  constructor(private readonly prisma: PrismaService) {}

  async forPrincipal(p: AuthPrincipal): Promise<number> {
    return this.forOrganization(p.tenantId, p.organizationId);
  }

  async forOrganization(tenantId: string, organizationId: string): Promise<number> {
    const setting = await this.prisma.organizationSetting.findFirst({
      where: { tenantId, organizationId, key: OVERTIME_SETTING_KEY, deletedAt: null },
      select: { value: true },
    });
    return normalizeOvertimeMultiplier((setting?.value as { multiplier?: unknown } | null)?.multiplier);
  }
}

/**
 * Coerces a stored/submitted multiplier to a usable one. Anything missing,
 * non-numeric, or outside the sane band falls back to the default rather than
 * silently producing a wrong payslip.
 */
export function normalizeOvertimeMultiplier(raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_OVERTIME_MULTIPLIER;
  if (value < MIN_OVERTIME_MULTIPLIER || value > MAX_OVERTIME_MULTIPLIER) {
    return DEFAULT_OVERTIME_MULTIPLIER;
  }
  return value;
}
