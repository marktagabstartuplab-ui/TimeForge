import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A single progressive bracket, normalized to plain numbers for arithmetic. */
export interface TaxBracket {
  sequence: number;
  minIncome: number;
  /** null = top bracket, unbounded. */
  maxIncome: number | null;
  baseTax: number;
  rate: number;
}

export interface IncomeTaxResult {
  /** Tax to withhold in this payroll period. Never negative. */
  taxInThisPeriod: number;
  /** Cumulative taxable income for the year, this period included. */
  yearToDateTaxableIncome: number;
  /** Cumulative tax withheld for the year, this period included. */
  yearToDateTax: number;
  /** Marginal bracket the cumulative income landed in — surfaced on reports. */
  bracket: number;
}

/**
 * 2026 BIR annual withholding schedule (TRAIN Act, RA 10963), used when the
 * database has no table row for the requested year — a payroll run must never
 * silently withhold zero because a seed did not land.
 */
export const BIR_2026_BRACKETS: TaxBracket[] = [
  { sequence: 1, minIncome: 0, maxIncome: 250_000, baseTax: 0, rate: 0 },
  { sequence: 2, minIncome: 250_000, maxIncome: 400_000, baseTax: 0, rate: 0.15 },
  { sequence: 3, minIncome: 400_000, maxIncome: 800_000, baseTax: 22_500, rate: 0.2 },
  { sequence: 4, minIncome: 800_000, maxIncome: 2_000_000, baseTax: 102_500, rate: 0.25 },
  { sequence: 5, minIncome: 2_000_000, maxIncome: 8_000_000, baseTax: 402_500, rate: 0.3 },
  { sequence: 6, minIncome: 8_000_000, maxIncome: null, baseTax: 2_202_500, rate: 0.35 },
];

/** Rounds to centavos. Payroll money is never carried at full float precision. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Annual tax due on a full year's taxable income, per the progressive schedule.
 *
 * Brackets are matched on `minIncome` descending rather than on the `maxIncome`
 * range, so a gap or overlap in badly-entered data still resolves to the highest
 * applicable bracket instead of falling through to zero tax.
 */
export function annualTaxOn(taxableIncome: number, brackets: TaxBracket[]): number {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;
  const ordered = [...brackets].sort((a, b) => b.minIncome - a.minIncome);
  const bracket = ordered.find((b) => taxableIncome > b.minIncome) ?? ordered[ordered.length - 1];
  if (!bracket) return 0;
  return round2(bracket.baseTax + (taxableIncome - bracket.minIncome) * bracket.rate);
}

/**
 * Derives the RR 11-2018 withholding table for a payroll frequency from the
 * annual schedule, by dividing every threshold and base tax by the number of
 * periods in a year. That is exactly how BIR's published daily/weekly/
 * semi-monthly/monthly tables are constructed, so this reproduces them rather
 * than duplicating four more hard-coded tables that could drift from the annual
 * one an admin configures.
 *
 * Semi-monthly (24 periods) checks out against the published table:
 *   250,000/24 = 10,416.67 · 400,000/24 = 16,666.67 · 22,500/24 = 937.50
 */
export function perPeriodBrackets(brackets: TaxBracket[], periodsPerYear: number): TaxBracket[] {
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) return brackets;
  return brackets.map((b) => ({
    sequence: b.sequence,
    minIncome: b.minIncome / periodsPerYear,
    maxIncome: b.maxIncome === null ? null : b.maxIncome / periodsPerYear,
    baseTax: b.baseTax / periodsPerYear,
    rate: b.rate,
  }));
}

/** Index (1-based sequence) of the bracket a given income falls in. */
export function bracketFor(taxableIncome: number, brackets: TaxBracket[]): number {
  const ordered = [...brackets].sort((a, b) => b.minIncome - a.minIncome);
  return (ordered.find((b) => taxableIncome > b.minIncome) ?? ordered[ordered.length - 1])?.sequence ?? 1;
}

/**
 * BIR withholding tax calculator.
 *
 * Regular payroll uses the per-period withholding table (RR 11-2018): the
 * period's taxable income is taxed against the schedule for its own frequency,
 * so withholding is level across the year and a payslip shows tax from the very
 * first cutoff.
 *
 * This replaced a cumulative (year-to-date) method that taxed income-so-far
 * against the *annual* table. Both converge on the same annual liability, but
 * the cumulative one withheld nothing until an employee crossed ₱250,000 YTD —
 * around period 13 on a typical salary — and then took it in a lump. Every
 * payslip in production read ₱0.00 tax as a result.
 *
 * A 13th-month payout keeps the cumulative treatment: it is a lump-sum benefit
 * assessed against the annual schedule, and running it through a semi-monthly
 * table would tax it as though that amount recurred 24 times a year.
 */
@Injectable()
export class BirTaxService {
  private readonly logger = new Logger(BirTaxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the active bracket set for a tax year. Falls back to the built-in 2026
   * schedule when the year is not configured.
   */
  async getBrackets(taxYear: number): Promise<TaxBracket[]> {
    const table = await this.prisma.birTaxTable.findFirst({
      where: { taxYear, isActive: true },
      include: { brackets: { orderBy: { sequence: 'asc' } } },
    });

    if (!table || table.brackets.length === 0) {
      this.logger.warn(
        `No active BIR tax table for ${taxYear}; falling back to the built-in 2026 schedule.`,
      );
      return BIR_2026_BRACKETS;
    }

    return table.brackets.map((b) => ({
      sequence: b.sequence,
      minIncome: Number(b.minIncome),
      maxIncome: b.maxIncome === null ? null : Number(b.maxIncome),
      baseTax: Number(b.baseTax),
      rate: Number(b.rate),
    }));
  }

  /**
   * @param taxableIncome        this period's taxable income (gross less mandatory contributions)
   * @param yearToDateIncome     taxable income already recognised earlier this year
   * @param yearToDateTaxWithheld tax already withheld earlier this year
   * @param brackets             the annual schedule
   * @param periodsPerYear       payroll frequency — 24 semi-monthly, 12 monthly.
   *   Omit (or pass 0) to fall back to the cumulative annual method, which is
   *   what a 13th-month run wants.
   */
  calculateIncomeTax(
    taxableIncome: number,
    yearToDateIncome: number,
    yearToDateTaxWithheld: number,
    brackets: TaxBracket[],
    periodsPerYear = 0,
  ): IncomeTaxResult {
    const priorIncome = Math.max(0, yearToDateIncome);
    const priorTax = Math.max(0, yearToDateTaxWithheld);
    const thisPeriod = Math.max(0, taxableIncome);
    const cumulativeIncome = round2(priorIncome + thisPeriod);

    let taxInThisPeriod: number;
    if (periodsPerYear > 0) {
      // RR 11-2018: this period's income against this frequency's table. Prior
      // withholding is not netted off — each period stands alone, which is what
      // makes the deduction level instead of back-loaded.
      taxInThisPeriod = annualTaxOn(thisPeriod, perPeriodBrackets(brackets, periodsPerYear));
    } else {
      // Cumulative: annual liability on income so far, less what is already
      // withheld. Floors at zero — a refund is out of scope for a withholding
      // run (BIR settles over-withholding at annualization), so this never
      // claws money back out of a payslip.
      taxInThisPeriod = round2(Math.max(0, annualTaxOn(cumulativeIncome, brackets) - priorTax));
    }

    return {
      taxInThisPeriod,
      yearToDateTaxableIncome: cumulativeIncome,
      yearToDateTax: round2(priorTax + taxInThisPeriod),
      bracket: bracketFor(cumulativeIncome, brackets),
    };
  }
}
