/**
 * BUG-AZ — contribution collection-list layouts for the SSS, PhilHealth and
 * Pag-IBIG employer portals.
 *
 * Pure functions, no Prisma or Nest dependency: the column order and the
 * employee/employer split are exactly what a remittance clerk uploads, so they
 * are worth pinning down in unit tests independently of how the rows are
 * queried.
 *
 * These build the *collection list* each portal accepts — the per-member lines
 * plus a grand total. They deliberately do not recompute any contribution: the
 * amounts are read straight off the generated payroll line items.
 */

import { formatStatutoryId, type StatutoryIdField } from './statutory-ids';

export type ContributionAgency = 'SSS' | 'PHILHEALTH' | 'PAGIBIG';

/** One employee's line, as read off a generated payroll line item. */
export interface StatutoryExportRow {
  lastName: string;
  firstName: string;
  tin: string | null;
  sssNumber: string | null;
  philhealthNumber: string | null;
  pagibigNumber: string | null;
  monthlyGrossBasis: string;
  employeeShare: string;
  employerShare: string;
  total: string;
}

export interface StatutoryExportSheet {
  /** Column headings, in the order the portal template expects. */
  header: string[];
  /** Member lines, already ordered. */
  rows: (string | number)[][];
  /** Trailing grand-total line; rendered bold in Excel, appended as-is in CSV. */
  totalRow: (string | number)[];
  /** Base filename (no extension). */
  filenameStem: string;
}

/** The member-number column each agency keys its collection list on. */
export const AGENCY_ID_FIELD: Record<ContributionAgency, StatutoryIdField> = {
  SSS: 'sssNumber',
  PHILHEALTH: 'philhealthNumber',
  PAGIBIG: 'pagibigNumber',
};

/**
 * Per-agency column headings. The member-number column is named as the portal
 * names it, because a clerk maps these headings to the upload template by eye.
 */
const AGENCY_HEADER: Record<ContributionAgency, string[]> = {
  SSS: [
    'SS Number',
    'Last Name',
    'First Name',
    'Monthly Salary Credit',
    'EE Share',
    'ER Share',
    'Total Contribution',
  ],
  PHILHEALTH: [
    'PhilHealth Identification Number',
    'Last Name',
    'First Name',
    'Monthly Basic Salary',
    'Personal Share',
    'Employer Share',
    'Total Premium',
  ],
  PAGIBIG: [
    'Pag-IBIG MID Number',
    'Last Name',
    'First Name',
    'Monthly Compensation',
    'EE Contribution',
    'ER Contribution',
    'Total Contribution',
  ],
};

function sum(values: string[]): string {
  // Contributions are already rounded to centavos upstream; summing in centavos
  // keeps the grand total exact instead of accumulating float drift.
  const centavos = values.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0);
  return (centavos / 100).toFixed(2);
}

/**
 * Builds the collection-list sheet for one agency.
 *
 * @param periodLabel `YYYY-MM-DD` start of the payroll period, used in the filename.
 */
export function buildContributionSheet(
  agency: ContributionAgency,
  rows: StatutoryExportRow[],
  periodLabel: string,
): StatutoryExportSheet {
  const idField = AGENCY_ID_FIELD[agency];

  const body = rows.map((r) => [
    formatStatutoryId(idField, r[idField]),
    r.lastName,
    r.firstName,
    Number(r.monthlyGrossBasis).toFixed(2),
    Number(r.employeeShare).toFixed(2),
    Number(r.employerShare).toFixed(2),
    Number(r.total).toFixed(2),
  ]);

  const totalRow = [
    'TOTAL',
    '',
    `${rows.length} member${rows.length === 1 ? '' : 's'}`,
    '',
    sum(rows.map((r) => r.employeeShare)),
    sum(rows.map((r) => r.employerShare)),
    sum(rows.map((r) => r.total)),
  ];

  return {
    header: AGENCY_HEADER[agency],
    rows: body,
    totalRow,
    filenameStem: `${agency.toLowerCase()}-contributions-${periodLabel}`,
  };
}

/** Escapes a CSV cell — names contain commas ("Cruz, Ana") and would split the row. */
export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Renders a sheet as CSV. Prefixed with a UTF-8 BOM so Excel on a Windows
 * clerk's machine opens the peso figures and ñ in names correctly instead of
 * as mojibake.
 */
export function sheetToCsv(sheet: StatutoryExportSheet): Buffer {
  const lines = [sheet.header, ...sheet.rows, sheet.totalRow].map((r) => r.map(csvCell).join(','));
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf-8');
}
