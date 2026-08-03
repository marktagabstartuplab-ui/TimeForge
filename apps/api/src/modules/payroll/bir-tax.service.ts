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

/** Index (1-based sequence) of the bracket a given income falls in. */
export function bracketFor(taxableIncome: number, brackets: TaxBracket[]): number {
  const ordered = [...brackets].sort((a, b) => b.minIncome - a.minIncome);
  return (ordered.find((b) => taxableIncome > b.minIncome) ?? ordered[ordered.length - 1])?.sequence ?? 1;
}

/**
 * BIR withholding tax calculator.
 *
 * Uses the cumulative (year-to-date) method rather than annualizing a single
 * period: tax for the period is the annual tax on income earned so far, less
 * what has already been withheld. That is what keeps the two properties the
 * feature brief demands — YTD figures can never jump backward (the cumulative
 * base only grows), and the sum of every period's withholding equals the exact
 * annual liability, so an employee is never under-withheld at year end.
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
   */
  calculateIncomeTax(
    taxableIncome: number,
    yearToDateIncome: number,
    yearToDateTaxWithheld: number,
    brackets: TaxBracket[],
  ): IncomeTaxResult {
    const priorIncome = Math.max(0, yearToDateIncome);
    const priorTax = Math.max(0, yearToDateTaxWithheld);
    const cumulativeIncome = round2(priorIncome + Math.max(0, taxableIncome));

    const cumulativeTaxDue = annualTaxOn(cumulativeIncome, brackets);

    // A refund is out of scope for a withholding run (BIR handles over-withholding
    // at annualization), so the period figure floors at zero rather than going
    // negative and clawing money back out of a payslip.
    const taxInThisPeriod = round2(Math.max(0, cumulativeTaxDue - priorTax));

    return {
      taxInThisPeriod,
      yearToDateTaxableIncome: cumulativeIncome,
      yearToDateTax: round2(priorTax + taxInThisPeriod),
      bracket: bracketFor(cumulativeIncome, brackets),
    };
  }
}
