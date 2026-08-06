/**
 * BUG-AZ — Philippine statutory identifier masks for the Employee Profile form.
 *
 * Mirrors `apps/api/src/modules/payroll/statutory-ids.ts`. Duplicated rather
 * than imported because `apps/web` is a separate npm project with no path to
 * `@timeforge/shared` — the API remains the authority, this is the inline hint
 * so HR sees the problem before saving.
 */

export type StatutoryIdField = "tin" | "sssNumber" | "philhealthNumber" | "pagibigNumber";

interface IdSpec {
  label: string;
  /** Digit counts the agency accepts. */
  lengths: number[];
  /** Segment widths keyed by total digit count. */
  groups: Record<number, number[]>;
  placeholder: string;
  hint: string;
}

export const STATUTORY_ID_SPECS: Record<StatutoryIdField, IdSpec> = {
  tin: {
    label: "TIN",
    lengths: [9, 12, 14],
    groups: { 9: [3, 3, 3], 12: [3, 3, 3, 3], 14: [3, 3, 3, 5] },
    placeholder: "123-456-789-000",
    hint: "9 digits, or 12 with branch code",
  },
  sssNumber: {
    label: "SSS Number",
    lengths: [10],
    groups: { 10: [2, 7, 1] },
    placeholder: "02-1234567-8",
    hint: "10 digits",
  },
  philhealthNumber: {
    label: "PhilHealth Number",
    lengths: [12],
    groups: { 12: [2, 9, 1] },
    placeholder: "19-001234567-8",
    hint: "12 digits",
  },
  pagibigNumber: {
    label: "Pag-IBIG (HDMF) Number",
    lengths: [12],
    groups: { 12: [4, 4, 4] },
    placeholder: "1212-3456-7890",
    hint: "12 digits",
  },
};

/** Strips every separator, leaving the digits the API stores. */
export function normalizeStatutoryId(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Applies the agency's separators as the user types. Never truncates below the
 * longest accepted length, so a TIN can still grow into its branch code.
 */
export function maskStatutoryId(field: StatutoryIdField, raw: string): string {
  const spec = STATUTORY_ID_SPECS[field];
  const max = Math.max(...spec.lengths);
  const digits = normalizeStatutoryId(raw).slice(0, max);
  if (digits.length === 0) return "";

  // Group against the shortest accepted length that still fits what's typed, so
  // the separators settle into place progressively instead of jumping at the end.
  const target = spec.lengths.find((l) => digits.length <= l) ?? max;
  const groups = spec.groups[target] ?? [max];

  const parts: string[] = [];
  let cursor = 0;
  for (const width of groups) {
    if (cursor >= digits.length) break;
    parts.push(digits.slice(cursor, cursor + width));
    cursor += width;
  }
  return parts.join("-");
}

/** Empty is valid — HR may onboard someone before collecting their IDs. */
export function isValidStatutoryId(field: StatutoryIdField, raw: string): boolean {
  if (raw.trim() === "") return true;
  if (!/^[\d\s.-]+$/.test(raw)) return false;
  return STATUTORY_ID_SPECS[field].lengths.includes(normalizeStatutoryId(raw).length);
}

/** Inline error text, or null when the value is acceptable. */
export function statutoryIdError(field: StatutoryIdField, raw: string): string | null {
  if (isValidStatutoryId(field, raw)) return null;
  const spec = STATUTORY_ID_SPECS[field];
  return `${spec.label} must be ${spec.lengths.join(" or ")} digits`;
}
