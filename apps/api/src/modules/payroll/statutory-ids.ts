/**
 * BUG-AZ — Philippine statutory identifiers ("201 file").
 *
 * Kept as pure functions with no Prisma or Nest dependency so the digit rules
 * are directly unit-testable. Numbers are persisted digits-only; each agency
 * portal wants its own punctuation, so formatting lives here rather than being
 * baked into whatever the HR clerk happened to type.
 */

export type StatutoryIdField = 'tin' | 'sssNumber' | 'philhealthNumber' | 'pagibigNumber';

interface IdSpec {
  label: string;
  /** Digit counts the agency accepts. */
  lengths: number[];
  /** Segment widths used when rendering for the portal, longest form first. */
  groups: Record<number, number[]>;
}

export const STATUTORY_ID_SPECS: Record<StatutoryIdField, IdSpec> = {
  // BIR TIN: 9-digit base, optionally followed by a 3- or 5-digit branch code.
  // 12 digits is the common "with branch" form (000-000-000-000).
  tin: { label: 'TIN', lengths: [9, 12, 14], groups: { 9: [3, 3, 3], 12: [3, 3, 3, 3], 14: [3, 3, 3, 5] } },
  // SSS common reference: 10 digits, 00-0000000-0.
  sssNumber: { label: 'SSS Number', lengths: [10], groups: { 10: [2, 7, 1] } },
  // PhilHealth Identification Number: 12 digits, 00-000000000-0.
  philhealthNumber: { label: 'PhilHealth Number', lengths: [12], groups: { 12: [2, 9, 1] } },
  // Pag-IBIG MID / RTN: 12 digits, 0000-0000-0000.
  pagibigNumber: { label: 'Pag-IBIG Number', lengths: [12], groups: { 12: [4, 4, 4] } },
};

/** Strips separators an HR clerk may have typed (dashes, spaces, dots). */
export function normalizeStatutoryId(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * True when `raw` normalizes to a digit count the agency accepts. An empty
 * string is valid — clearing a number HR entered by mistake must be allowed.
 */
export function isValidStatutoryId(field: StatutoryIdField, raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined || raw.trim() === '') return true;
  // Reject anything carrying characters that are neither digits nor the
  // separators people conventionally type — a letter is a typo, not a format.
  if (!/^[\d\s.-]+$/.test(raw)) return false;
  return STATUTORY_ID_SPECS[field].lengths.includes(normalizeStatutoryId(raw).length);
}

/**
 * Renders a stored digits-only number in the agency's display format. Returns
 * an empty string for a missing number so export cells stay blank rather than
 * printing "null".
 */
export function formatStatutoryId(field: StatutoryIdField, stored: string | null | undefined): string {
  if (!stored) return '';
  const digits = normalizeStatutoryId(stored);
  const groups = STATUTORY_ID_SPECS[field].groups[digits.length];
  // An unrecognised length can only come from data written before this rule
  // existed. Show it verbatim rather than silently mangling it.
  if (!groups) return digits;

  const parts: string[] = [];
  let cursor = 0;
  for (const width of groups) {
    parts.push(digits.slice(cursor, cursor + width));
    cursor += width;
  }
  return parts.join('-');
}

/** Human-facing message for a rejected value, used by the DTO validator. */
export function statutoryIdMessage(field: StatutoryIdField): string {
  const spec = STATUTORY_ID_SPECS[field];
  const lengths = spec.lengths.join(' or ');
  return `${spec.label} must be ${lengths} digits (separators optional)`;
}
