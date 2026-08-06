import {
  formatStatutoryId,
  isValidStatutoryId,
  normalizeStatutoryId,
} from './statutory-ids';
import {
  buildContributionSheet,
  sheetToCsv,
  type StatutoryExportRow,
} from './statutory-export';

/**
 * BUG-AZ — Philippine statutory IDs ("201 file") and contribution exporters.
 *
 * The digit rules and the portal column layouts are what a remittance clerk
 * uploads, so they are pinned here independently of how the rows are queried.
 */

function row(overrides: Partial<StatutoryExportRow> = {}): StatutoryExportRow {
  return {
    lastName: 'Cruz',
    firstName: 'Ana',
    tin: '123456789000',
    sssNumber: '0212345678',
    philhealthNumber: '190012345678',
    pagibigNumber: '121234567890',
    monthlyGrossBasis: '25000.00',
    employeeShare: '1250.00',
    employerShare: '2500.00',
    total: '3750.00',
    ...overrides,
  };
}

describe('BUG-AZ — statutory ID validation', () => {
  it('(a) accepts a 9-digit and a 12-digit TIN, with or without separators', () => {
    expect(isValidStatutoryId('tin', '123456789')).toBe(true);
    expect(isValidStatutoryId('tin', '123-456-789')).toBe(true);
    expect(isValidStatutoryId('tin', '123-456-789-000')).toBe(true);
  });

  it('(a) rejects a TIN of the wrong digit count or carrying letters', () => {
    expect(isValidStatutoryId('tin', '12345678')).toBe(false);
    expect(isValidStatutoryId('tin', '1234567890')).toBe(false);
    expect(isValidStatutoryId('tin', '12345678X')).toBe(false);
  });

  it('(b) enforces each agency digit mask: SSS 10, PhilHealth 12, Pag-IBIG 12', () => {
    expect(isValidStatutoryId('sssNumber', '02-1234567-8')).toBe(true);
    expect(isValidStatutoryId('sssNumber', '021234567')).toBe(false);

    expect(isValidStatutoryId('philhealthNumber', '19-001234567-8')).toBe(true);
    expect(isValidStatutoryId('philhealthNumber', '1900123456')).toBe(false);

    expect(isValidStatutoryId('pagibigNumber', '1212-3456-7890')).toBe(true);
    expect(isValidStatutoryId('pagibigNumber', '12123456789')).toBe(false);
  });

  it('treats an empty or absent value as valid — HR may onboard before collecting IDs', () => {
    expect(isValidStatutoryId('sssNumber', '')).toBe(true);
    expect(isValidStatutoryId('sssNumber', null)).toBe(true);
    expect(isValidStatutoryId('sssNumber', undefined)).toBe(true);
  });

  it('normalizes to digits only for storage', () => {
    expect(normalizeStatutoryId('02-1234567-8')).toBe('0212345678');
    expect(normalizeStatutoryId('1212 3456 7890')).toBe('121234567890');
  });

  it('(b) renders each stored number in its portal display mask', () => {
    expect(formatStatutoryId('sssNumber', '0212345678')).toBe('02-1234567-8');
    expect(formatStatutoryId('philhealthNumber', '190012345678')).toBe('19-001234567-8');
    expect(formatStatutoryId('pagibigNumber', '121234567890')).toBe('1212-3456-7890');
    expect(formatStatutoryId('tin', '123456789')).toBe('123-456-789');
    expect(formatStatutoryId('tin', '123456789000')).toBe('123-456-789-000');
  });

  it('renders a missing number as an empty cell, not "null"', () => {
    expect(formatStatutoryId('sssNumber', null)).toBe('');
    expect(formatStatutoryId('sssNumber', undefined)).toBe('');
  });
});

describe('BUG-AZ — contribution collection-list exporters', () => {
  it('(c) SSS export carries the SS number, name and EE/ER split', () => {
    const sheet = buildContributionSheet('SSS', [row()], '2026-08-01');

    expect(sheet.header[0]).toBe('SS Number');
    expect(sheet.rows).toEqual([
      ['02-1234567-8', 'Cruz', 'Ana', '25000.00', '1250.00', '2500.00', '3750.00'],
    ]);
    expect(sheet.filenameStem).toBe('sss-contributions-2026-08-01');
  });

  it('(d) PhilHealth export uses the portal PIN column and premium wording', () => {
    const sheet = buildContributionSheet('PHILHEALTH', [row()], '2026-08-01');

    expect(sheet.header).toEqual([
      'PhilHealth Identification Number',
      'Last Name',
      'First Name',
      'Monthly Basic Salary',
      'Personal Share',
      'Employer Share',
      'Total Premium',
    ]);
    expect(sheet.rows[0][0]).toBe('19-001234567-8');
  });

  it('(e) Pag-IBIG export carries the MID number and the correct contribution amounts', () => {
    const sheet = buildContributionSheet(
      'PAGIBIG',
      [row({ employeeShare: '200.00', employerShare: '500.00', total: '700.00' })],
      '2026-08-01',
    );

    expect(sheet.header[0]).toBe('Pag-IBIG MID Number');
    expect(sheet.rows[0][0]).toBe('1212-3456-7890');
    expect(sheet.rows[0].slice(4)).toEqual(['200.00', '500.00', '700.00']);
  });

  it('(e) totals the EE, ER and combined columns exactly, without float drift', () => {
    const sheet = buildContributionSheet(
      'PAGIBIG',
      [
        row({ employeeShare: '100.10', employerShare: '200.20', total: '300.30' }),
        row({ employeeShare: '0.10', employerShare: '0.20', total: '0.30' }),
        row({ employeeShare: '50.05', employerShare: '99.95', total: '150.00' }),
      ],
      '2026-08-01',
    );

    expect(sheet.totalRow[0]).toBe('TOTAL');
    expect(sheet.totalRow[2]).toBe('3 members');
    expect(sheet.totalRow[4]).toBe('150.25');
    expect(sheet.totalRow[5]).toBe('300.35');
    expect(sheet.totalRow[6]).toBe('450.60');
  });

  it('leaves the member-number cell blank when HR has not captured that ID yet', () => {
    const sheet = buildContributionSheet('SSS', [row({ sssNumber: null })], '2026-08-01');
    expect(sheet.rows[0][0]).toBe('');
  });

  it('(f) renders CSV with a BOM, a header, the member lines and the total line', () => {
    const csv = sheetToCsv(buildContributionSheet('SSS', [row()], '2026-08-01')).toString('utf-8');
    const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n');

    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('SS Number,Last Name,First Name,Monthly Salary Credit,EE Share,ER Share,Total Contribution');
    expect(lines[2]).toBe('TOTAL,,1 member,,1250.00,2500.00,3750.00');
  });

  it('(f) quotes a name containing a comma so the row does not split', () => {
    const csv = sheetToCsv(
      buildContributionSheet('SSS', [row({ lastName: 'Cruz, Jr.' })], '2026-08-01'),
    ).toString('utf-8');

    expect(csv).toContain('"Cruz, Jr."');
  });
});
