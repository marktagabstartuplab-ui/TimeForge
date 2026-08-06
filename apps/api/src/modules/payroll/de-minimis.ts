import { DeMinimisType } from '@prisma/client';

/**
 * De minimis ceilings from BIR RR 11-2018, normalised to a *monthly* figure so
 * a payroll run can prorate them against the period without special-casing each
 * benefit's natural cadence.
 *
 * `monthlyCap: null` means the regulation sets no fixed peso ceiling — the
 * overtime meal benefit is capped at 25% of the basic minimum wage, which
 * varies by region, so it is left uncapped here and validated by HR.
 */
export interface DeMinimisRule {
  type: DeMinimisType;
  label: string;
  /** Effective monthly ceiling in PHP, or null when there is no peso ceiling. */
  monthlyCap: number | null;
  /** How the regulation states the ceiling, for display next to the input. */
  statutoryBasis: string;
}

export const DE_MINIMIS_RULES: Record<DeMinimisType, DeMinimisRule> = {
  RICE_SUBSIDY: {
    type: DeMinimisType.RICE_SUBSIDY,
    label: 'Rice Subsidy',
    monthlyCap: 2000,
    statutoryBasis: '₱2,000 per month (or one 50kg sack of rice)',
  },
  CLOTHING_ALLOWANCE: {
    type: DeMinimisType.CLOTHING_ALLOWANCE,
    label: 'Uniform & Clothing Allowance',
    monthlyCap: 500,
    statutoryBasis: '₱6,000 per year (₱500 per month)',
  },
  LAUNDRY_ALLOWANCE: {
    type: DeMinimisType.LAUNDRY_ALLOWANCE,
    label: 'Laundry Allowance',
    monthlyCap: 300,
    statutoryBasis: '₱300 per month',
  },
  MEDICAL_ALLOWANCE: {
    type: DeMinimisType.MEDICAL_ALLOWANCE,
    label: 'Medical Assistance (Actual)',
    monthlyCap: 833.33,
    statutoryBasis: '₱10,000 per year (₱833.33 per month)',
  },
  MEDICAL_CASH_ALLOWANCE_DEPENDENTS: {
    type: DeMinimisType.MEDICAL_CASH_ALLOWANCE_DEPENDENTS,
    label: 'Medical Cash Allowance to Dependents',
    monthlyCap: 250,
    statutoryBasis: '₱1,500 per semester (₱250 per month)',
  },
  MEAL_ALLOWANCE: {
    type: DeMinimisType.MEAL_ALLOWANCE,
    label: 'Overtime Meal Benefit',
    monthlyCap: null,
    statutoryBasis: '25% of the regional basic minimum wage — no fixed peso cap',
  },
  OTHER: {
    type: DeMinimisType.OTHER,
    label: 'Other De Minimis Benefit',
    monthlyCap: null,
    statutoryBasis: 'No statutory peso ceiling — verify against RR 11-2018',
  },
};

export const DE_MINIMIS_CATALOG: DeMinimisRule[] = Object.values(DE_MINIMIS_RULES);

/**
 * Clamp a requested monthly amount to its BIR ceiling.
 *
 * Capping rather than rejecting is deliberate: the excess over a de minimis
 * ceiling is not illegal, it is simply taxable compensation, so HR's entry is
 * accepted and only the non-taxable portion is recorded here.
 */
export function capDeMinimisAmount(
  type: DeMinimisType,
  requested: number,
): { amount: number; cap: number | null; wasCapped: boolean } {
  const cap = DE_MINIMIS_RULES[type]?.monthlyCap ?? null;
  if (cap === null || requested <= cap) {
    return { amount: requested, cap, wasCapped: false };
  }
  return { amount: cap, cap, wasCapped: true };
}
