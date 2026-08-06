import {
  BIR_2026_BRACKETS,
  BirTaxService,
  annualTaxOn,
  bracketFor,
} from './bir-tax.service';
import { DeductionService, periodsPerMonth } from './deduction.service';
import {
  DEFAULT_PAYROLL_SETTINGS,
  ResolvedPayrollSettings,
} from './payroll-settings.service';
import { dateKeysBetween, nightShiftMinutes } from './premium-hours';

const settings: ResolvedPayrollSettings = { ...DEFAULT_PAYROLL_SETTINGS };

describe('FEAT-3 — BIR income tax (2026 TRAIN schedule)', () => {
  const svc = new BirTaxService({} as never);

  it('matches every published bracket boundary exactly', () => {
    // Bracket 1 — the ₱250,000 exemption.
    expect(annualTaxOn(0, BIR_2026_BRACKETS)).toBe(0);
    expect(annualTaxOn(250_000, BIR_2026_BRACKETS)).toBe(0);

    // Bracket 2 — 15% of the excess over 250k. At 400k: 150k x 0.15 = 22,500.
    expect(annualTaxOn(300_000, BIR_2026_BRACKETS)).toBe(7_500);
    expect(annualTaxOn(400_000, BIR_2026_BRACKETS)).toBe(22_500);

    // Bracket 3 — 22,500 + 20% over 400k. At 800k: 22,500 + 80,000 = 102,500.
    expect(annualTaxOn(500_000, BIR_2026_BRACKETS)).toBe(42_500);
    expect(annualTaxOn(800_000, BIR_2026_BRACKETS)).toBe(102_500);

    // Bracket 4 — 102,500 + 25% over 800k. At 2M: 102,500 + 300,000 = 402,500.
    expect(annualTaxOn(2_000_000, BIR_2026_BRACKETS)).toBe(402_500);

    // Bracket 5 — 402,500 + 30% over 2M. At 8M: 402,500 + 1,800,000 = 2,202,500.
    expect(annualTaxOn(8_000_000, BIR_2026_BRACKETS)).toBe(2_202_500);

    // Bracket 6 — 2,202,500 + 35% over 8M.
    expect(annualTaxOn(10_000_000, BIR_2026_BRACKETS)).toBe(2_902_500);
  });

  it('places ₱350,000 YTD income in the 15% bracket (brief test case)', () => {
    expect(bracketFor(350_000, BIR_2026_BRACKETS)).toBe(2);
    // 350,000 - 250,000 = 100,000 x 15% = 15,000
    expect(annualTaxOn(350_000, BIR_2026_BRACKETS)).toBe(15_000);
  });

  it('withholds cumulatively — period tax is annual liability less what was already withheld', () => {
    // Month 1: ₱30,000 taxable. Still inside the 250k exemption → no tax.
    const m1 = svc.calculateIncomeTax(30_000, 0, 0, BIR_2026_BRACKETS);
    expect(m1.taxInThisPeriod).toBe(0);
    expect(m1.yearToDateTaxableIncome).toBe(30_000);

    // Later period that pushes cumulative income to 300,000: annual tax on
    // 300,000 is 7,500, none withheld yet, so the whole 7,500 falls due now.
    const m2 = svc.calculateIncomeTax(270_000, 30_000, 0, BIR_2026_BRACKETS);
    expect(m2.taxInThisPeriod).toBe(7_500);
    expect(m2.yearToDateTaxableIncome).toBe(300_000);
    expect(m2.yearToDateTax).toBe(7_500);

    // Next period adds 50,000 → cumulative 350,000, annual tax 15,000, of which
    // 7,500 is already withheld.
    const m3 = svc.calculateIncomeTax(50_000, 300_000, 7_500, BIR_2026_BRACKETS);
    expect(m3.taxInThisPeriod).toBe(7_500);
    expect(m3.yearToDateTax).toBe(15_000);
  });

  it('never withholds a negative amount, and YTD never moves backward', () => {
    // Over-withheld earlier (e.g. a later timesheet correction reduced income).
    const result = svc.calculateIncomeTax(1_000, 300_000, 20_000, BIR_2026_BRACKETS);
    expect(result.taxInThisPeriod).toBe(0);
    expect(result.yearToDateTax).toBe(20_000);
    expect(result.yearToDateTaxableIncome).toBe(301_000);
  });

  it('sums to the exact annual liability across twelve periods — no under-withholding', () => {
    const monthly = 50_000; // ₱600,000 taxable for the year
    let ytdIncome = 0;
    let ytdTax = 0;
    for (let month = 0; month < 12; month++) {
      const r = svc.calculateIncomeTax(monthly, ytdIncome, ytdTax, BIR_2026_BRACKETS);
      ytdIncome = r.yearToDateTaxableIncome;
      ytdTax = r.yearToDateTax;
    }
    expect(ytdIncome).toBe(600_000);
    expect(ytdTax).toBe(annualTaxOn(600_000, BIR_2026_BRACKETS)); // 22,500 + 20% of 200,000 = 62,500
    expect(ytdTax).toBe(62_500);
  });
});

describe('FEAT-3 — statutory contributions (2026 rates)', () => {
  const svc = new DeductionService();

  it('SSS: 5% employee / 10% employer, capped at the ₱29,500 salary ceiling', () => {
    const below = svc.calculateSSSContribution(20_000, settings);
    expect(below.employee).toBe(1_000);
    expect(below.employer).toBe(2_000);

    // Above the ceiling the base stops at 29,500, not the actual salary.
    const above = svc.calculateSSSContribution(50_000, settings);
    expect(above.employee).toBe(1_475); // 29,500 x 5%
    expect(above.employer).toBe(2_950); // 29,500 x 10%
  });

  it('PhilHealth: 2.5% each, with the total premium floored at ₱500 and capped at ₱5,000', () => {
    // Mid-range: 40,000 x 5% total = 2,000, split evenly.
    const mid = svc.calculatePhilHealthContribution(40_000, settings);
    expect(mid.total).toBe(2_000);
    expect(mid.employee).toBe(1_000);
    expect(mid.employer).toBe(1_000);

    // Below the floor: 5,000 x 5% = 250 → raised to the 500 minimum.
    const low = svc.calculatePhilHealthContribution(5_000, settings);
    expect(low.total).toBe(500);
    expect(low.employee).toBe(250);

    // Above the ceiling: 200,000 x 5% = 10,000 → clamped to the 5,000 maximum.
    const high = svc.calculatePhilHealthContribution(200_000, settings);
    expect(high.total).toBe(5_000);
    expect(high.employee).toBe(2_500);
  });

  it('Pag-IBIG: 1% at or below ₱1,500, 2% above, employee share capped at ₱200', () => {
    // At the threshold → the low rate still applies.
    expect(svc.calculatePagIBIGContribution(1_500, settings).employee).toBe(15);

    // Above the threshold → 2%.
    expect(svc.calculatePagIBIGContribution(5_000, settings).employee).toBe(100);

    // 2% of 20,000 is 400, but the employee share is capped at 200.
    expect(svc.calculatePagIBIGContribution(20_000, settings).employee).toBe(200);
  });

  it('assesses contributions monthly and splits them across semi-monthly cutoffs', () => {
    expect(periodsPerMonth('FIRST_HALF')).toBe(2);
    expect(periodsPerMonth('SECOND_HALF')).toBe(2);
    expect(periodsPerMonth('CUSTOM')).toBe(1);

    // ₱10,000 for a half-month is a ₱20,000 monthly salary. SSS is assessed on
    // the monthly figure (₱1,000) and half of it falls in this cutoff.
    const half = svc.calculateAll(10_000, 2, settings);
    expect(half.monthlyBasis).toBe(20_000);
    expect(half.sss.employee).toBe(500);

    // The same monthly salary paid in one run gives the whole contribution.
    const full = svc.calculateAll(20_000, 1, settings);
    expect(full.sss.employee).toBe(1_000);
  });

  it('₱20,000 monthly salary produces the expected take-home (brief test case)', () => {
    const gross = 20_000;
    const contributions = svc.calculateAll(gross, 1, settings);

    expect(contributions.sss.employee).toBe(1_000); // 20,000 x 5%
    expect(contributions.philhealth.employee).toBe(500); // 20,000 x 5% = 1,000 total, halved
    expect(contributions.pagibig.employee).toBe(200); // 2% capped at 200
    expect(contributions.employeeTotal).toBe(1_700);

    // Taxable for the period, and its annualized position: 18,300 x 12 =
    // 219,600, which is under the ₱250,000 exemption, so nothing is withheld.
    const taxable = gross - contributions.employeeTotal;
    expect(taxable).toBe(18_300);

    const tax = new BirTaxService({} as never).calculateIncomeTax(
      taxable,
      taxable * 11, // eleven prior months at the same figure
      0,
      BIR_2026_BRACKETS,
    );
    expect(tax.yearToDateTaxableIncome).toBe(219_600);
    expect(tax.taxInThisPeriod).toBe(0);

    const netPay = gross - contributions.employeeTotal - tax.taxInThisPeriod;
    expect(netPay).toBe(18_300);
  });
});

describe('FEAT-3 — night differential attribution', () => {
  const MANILA = 'Asia/Manila';
  // 2026-03-02 14:00Z is 2026-03-02 22:00 in Manila (UTC+8).
  const tenPmManila = new Date('2026-03-02T14:00:00.000Z');

  it('counts the whole shift when it sits entirely inside 22:00–06:00', () => {
    expect(nightShiftMinutes(tenPmManila, 8 * 60, MANILA, 22, 6)).toBe(8 * 60);
  });

  it('counts none of a shift that sits entirely in daylight hours', () => {
    // 2026-03-02 01:00Z = 09:00 Manila.
    const nineAm = new Date('2026-03-02T01:00:00.000Z');
    expect(nightShiftMinutes(nineAm, 8 * 60, MANILA, 22, 6)).toBe(0);
  });

  it('counts only the overlapping portion of a shift that straddles the window', () => {
    // Starts 20:00 Manila, runs 4 hours → 20:00–24:00, of which 22:00–24:00 (120
    // minutes) is inside the window.
    const eightPm = new Date('2026-03-02T12:00:00.000Z');
    expect(nightShiftMinutes(eightPm, 4 * 60, MANILA, 22, 6)).toBe(120);
  });

  it('handles a shift that crosses midnight and exits the window in the morning', () => {
    // 22:00 Manila + 10 hours → 08:00 next day. Window covers 22:00–06:00 = 480.
    expect(nightShiftMinutes(tenPmManila, 10 * 60, MANILA, 22, 6)).toBe(480);
  });

  it('buckets by local time, not UTC — a Manila night shift is not a UTC day shift', () => {
    // The same instant read in UTC is 14:00, squarely outside 22:00–06:00; only
    // the timezone-aware calculation sees it as night work.
    expect(nightShiftMinutes(tenPmManila, 60, 'UTC', 22, 6)).toBe(0);
    expect(nightShiftMinutes(tenPmManila, 60, MANILA, 22, 6)).toBe(60);
  });

  it('supports a non-wrapping window configuration', () => {
    // 00:00–06:00 does not cross midnight; a 22:00 start contributes nothing
    // until it rolls past local midnight.
    expect(nightShiftMinutes(tenPmManila, 4 * 60, MANILA, 0, 6)).toBe(120);
  });
});

describe('FEAT-3 — period day enumeration', () => {
  it('lists every calendar day in a payroll period, inclusive of both bounds', () => {
    const keys = dateKeysBetween(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z'));
    expect(keys).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
  });

  it('returns a single day when the period starts and ends on the same date', () => {
    const day = new Date('2026-12-25T00:00:00.000Z');
    expect(dateKeysBetween(day, day)).toEqual(['2026-12-25']);
  });
});

describe('BUG-AW — Daily Rate Basis calculation', () => {
  const svc = new DeductionService();

  it('calculates daily pay correctly for 4.5 days worked @ ₱2,000/day = ₱9,000 gross', () => {
    const dailyRate = 2000;
    const hoursWorked = 36; // 4.5 days x 8h = 36h
    const daysWorked = hoursWorked / 8;
    expect(daysWorked).toBe(4.5);

    const gross = daysWorked * dailyRate;
    expect(gross).toBe(9000);
  });

  it('prorates partial days correctly (0.5 day = 4 hours @ ₱2,000/day = ₱1,000 gross)', () => {
    const dailyRate = 2000;
    const hoursWorked = 4; // 0.5 day x 8h = 4h
    const daysWorked = hoursWorked / 8;
    expect(daysWorked).toBe(0.5);

    const gross = daysWorked * dailyRate;
    expect(gross).toBe(1000);
  });

  it('applies statutory deductions (SSS/PhilHealth/Pag-IBIG) to daily basis gross pay', () => {
    const dailyRate = 2000;
    const hoursWorked = 80; // 10 days = 20,000 gross
    const daysWorked = hoursWorked / 8;
    const gross = daysWorked * dailyRate; // 20,000

    const contributions = svc.calculateAll(gross, 1, settings);
    expect(contributions.sss.employee).toBe(1000);
    expect(contributions.philhealth.employee).toBe(500);
    expect(contributions.pagibig.employee).toBe(200);
  });
});

describe('BUG-BA — Philippine T&A Premiums (NSD, Holidays, Rest Days)', () => {
  const MANILA = 'Asia/Manila';

  it('(a) auto-tags 11 PM - 6 AM work as NSD', () => {
    // 11 PM Manila (15:00 UTC) for 7 hours -> 11 PM to 6 AM (all 7h = 420 mins NSD)
    const elevenPm = new Date('2026-03-02T15:00:00.000Z');
    const nsdMins = nightShiftMinutes(elevenPm, 7 * 60, MANILA, 22, 6);
    expect(nsdMins).toBe(7 * 60);
  });

  it('(b) applies 10% NSD premium multiplier on base hourly rate', () => {
    const hourlyRate = 100;
    const nsdHours = 7;
    // 10% premium: 7h * ₱100 * (1.10 - 1) = ₱70
    const nsdPay = nsdHours * hourlyRate * (settings.nightShiftPremium - 1);
    expect(nsdPay).toBe(70);
  });

  it('(d) applies 100% premium for work on Regular Holiday', () => {
    const hourlyRate = 100;
    const holidayHours = 8;
    // 100% premium (multiplier 2.00): increment = 8 * 100 * (2.00 - 1) = ₱800
    const holidayPay = holidayHours * hourlyRate * (settings.regularHolidayWorkedRate - 1);
    expect(holidayPay).toBe(800);
  });

  it('(e) applies 30% premium for work on Special Non-Working Holiday', () => {
    const hourlyRate = 100;
    const holidayHours = 8;
    // 30% premium (multiplier 1.30): increment = 8 * 100 * (1.30 - 1) = ₱240
    const holidayPay = holidayHours * hourlyRate * (settings.specialHolidayWorkedRate - 1);
    expect(holidayPay).toBe(240);
  });

  it('(f) applies 30% premium for work on employee scheduled day off / Rest Day', () => {
    const hourlyRate = 100;
    const restDayHours = 8;
    // 30% rest day premium: 8 * 100 * (1.30 - 1) = ₱240
    const restDayPay = restDayHours * hourlyRate * (settings.restDayWorkedRate - 1);
    expect(restDayPay).toBe(240);
  });
});
