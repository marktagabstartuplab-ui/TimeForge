import { Injectable } from '@nestjs/common';
import { PayrollPeriodType } from '@prisma/client';
import { round2 } from './bir-tax.service';
import { ResolvedPayrollSettings } from './payroll-settings.service';

export interface ContributionShare {
  employee: number;
  employer: number;
  total: number;
}

export interface StatutoryContributions {
  sss: ContributionShare;
  philhealth: ContributionShare;
  pagibig: ContributionShare;
  /** Sum of the three employee shares — the amount that reduces taxable income. */
  employeeTotal: number;
  employerTotal: number;
  /** Monthly-equivalent gross the contributions were assessed on. */
  monthlyBasis: number;
}

/**
 * How many payroll periods make up one month, for a given period type. SSS,
 * PhilHealth and Pag-IBIG are all assessed on *monthly* salary; on a
 * semi-monthly payroll the monthly contribution is computed once and then split
 * across the two cutoffs. Assessing each half-month cutoff as if it were a full
 * month would roughly halve every employee's contribution and put the employer
 * out of compliance.
 */
export function periodsPerMonth(type: PayrollPeriodType): number {
  return type === 'FIRST_HALF' || type === 'SECOND_HALF' ? 2 : 1;
}

/**
 * Philippine statutory contribution engine (2026 rates).
 *
 * Every rate, cap and threshold is passed in from PayrollSettings — nothing is
 * hardcoded — so an SSS circular is a settings change rather than a deploy.
 */
@Injectable()
export class DeductionService {
  /**
   * SSS: a flat percentage of the monthly salary credit, which is the monthly
   * gross capped at the salary ceiling (₱29,500 for 2026).
   */
  calculateSSSContribution(
    monthlyGross: number,
    settings: ResolvedPayrollSettings,
  ): ContributionShare {
    const credit = Math.max(0, Math.min(monthlyGross, settings.sssSalaryCeiling));
    const employee = round2(credit * settings.sssEmployeeRate);
    const employer = round2(credit * settings.sssEmployerRate);
    return { employee, employer, total: round2(employee + employer) };
  }

  /**
   * PhilHealth: a total premium split evenly between employee and employer, with
   * a floor and ceiling applied to the *total* premium (not to each share) —
   * which is why the floor/ceiling are halved before being handed out.
   */
  calculatePhilHealthContribution(
    monthlyGross: number,
    settings: ResolvedPayrollSettings,
  ): ContributionShare {
    const gross = Math.max(0, monthlyGross);
    // No compensation for the period means no premium. The floor below is a
    // floor on a *contribution that is due*, not a charge that applies in the
    // absence of pay — applying it unconditionally billed employees with zero
    // gross ₱125 and produced a negative net pay of -₱125 on real line items.
    if (gross <= 0) return { employee: 0, employer: 0, total: 0 };

    const combinedRate = settings.philhealthEmployeeRate + settings.philhealthEmployerRate;
    const rawTotal = gross * combinedRate;
    const total = Math.max(settings.philhealthMin, Math.min(settings.philhealthMax, rawTotal));

    // Preserve the configured employee/employer split even after clamping, so a
    // non-even split (should an org ever configure one) survives the min/max.
    const employeeShare = combinedRate > 0 ? settings.philhealthEmployeeRate / combinedRate : 0.5;
    const employee = round2(total * employeeShare);
    const employer = round2(total - employee);
    return { employee, employer, total: round2(total) };
  }

  /**
   * Pag-IBIG: 1% at or below the salary threshold, 2% above it. The employee
   * share is capped (₱200 for 2026); the employer share is not capped by the
   * employee cap, but is assessed on the same capped salary base.
   */
  calculatePagIBIGContribution(
    monthlyGross: number,
    settings: ResolvedPayrollSettings,
  ): ContributionShare {
    const gross = Math.max(0, monthlyGross);
    const employeeRate =
      gross > settings.pagibigSalaryThreshold
        ? settings.pagibigEmployeeRateHigh
        : settings.pagibigEmployeeRateLow;

    const employee = round2(Math.min(gross * employeeRate, settings.pagibigEmployeeCap));

    // The employer share mirrors the employee's capped salary base: once the
    // employee share hits the cap, the base that produced it is the cap divided
    // by the applicable rate.
    const cappedBase =
      employeeRate > 0 ? Math.min(gross, settings.pagibigEmployeeCap / employeeRate) : gross;
    const employer = round2(cappedBase * settings.pagibigEmployerRate);

    return { employee, employer, total: round2(employee + employer) };
  }

  /**
   * All three contributions for one payroll period.
   *
   * @param periodGross gross earnings for this payroll period
   * @param periodsInMonth how many such periods make a month (see periodsPerMonth)
   */
  calculateAll(
    periodGross: number,
    periodsInMonth: number,
    settings: ResolvedPayrollSettings,
  ): StatutoryContributions {
    const divisor = periodsInMonth > 0 ? periodsInMonth : 1;
    const monthlyBasis = round2(Math.max(0, periodGross) * divisor);

    const perPeriod = (share: ContributionShare): ContributionShare => ({
      employee: round2(share.employee / divisor),
      employer: round2(share.employer / divisor),
      total: round2(share.total / divisor),
    });

    const sss = perPeriod(this.calculateSSSContribution(monthlyBasis, settings));
    const philhealth = perPeriod(this.calculatePhilHealthContribution(monthlyBasis, settings));
    const pagibig = perPeriod(this.calculatePagIBIGContribution(monthlyBasis, settings));

    return {
      sss,
      philhealth,
      pagibig,
      employeeTotal: round2(sss.employee + philhealth.employee + pagibig.employee),
      employerTotal: round2(sss.employer + philhealth.employer + pagibig.employer),
      monthlyBasis,
    };
  }
}
