"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { useCan } from "@/features/auth/rbac";
import {
  getPayrollSettings,
  updatePayrollSettings,
  type PayrollSettings,
  type PayrollSettingsUpdate,
} from "../api/payroll-compliance.service";

type FieldKey = keyof PayrollSettingsUpdate;

/**
 * How each field is entered vs. how it is stored. Rates are stored as fractions
 * (0.05) but entered as percentages (5) — asking an admin to type `0.025` for
 * PhilHealth is exactly how a rate ends up off by a factor of ten.
 */
type FieldKind = "percent" | "peso" | "multiplier" | "hour" | "year";

interface FieldDef {
  key: FieldKey;
  label: string;
  kind: FieldKind;
  hint?: string;
}

interface SectionDef {
  title: string;
  description: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: "SSS",
    description:
      "Assessed on the monthly salary credit — the monthly gross, capped at the salary ceiling.",
    fields: [
      { key: "sssEmployeeRate", label: "Employee rate", kind: "percent" },
      { key: "sssEmployerRate", label: "Employer rate", kind: "percent" },
      { key: "sssSalaryCeiling", label: "Salary ceiling", kind: "peso" },
    ],
  },
  {
    title: "PhilHealth",
    description:
      "The floor and ceiling apply to the combined premium, not to each share separately.",
    fields: [
      { key: "philhealthEmployeeRate", label: "Employee rate", kind: "percent" },
      { key: "philhealthEmployerRate", label: "Employer rate", kind: "percent" },
      { key: "philhealthMin", label: "Minimum total premium", kind: "peso" },
      { key: "philhealthMax", label: "Maximum total premium", kind: "peso" },
    ],
  },
  {
    title: "Pag-IBIG",
    description:
      "The low rate applies at or below the salary threshold, the high rate above it. The employee share is capped.",
    fields: [
      { key: "pagibigEmployeeRateLow", label: "Employee rate (at/below threshold)", kind: "percent" },
      { key: "pagibigEmployeeRateHigh", label: "Employee rate (above threshold)", kind: "percent" },
      { key: "pagibigEmployerRate", label: "Employer rate", kind: "percent" },
      { key: "pagibigSalaryThreshold", label: "Salary threshold", kind: "peso" },
      { key: "pagibigEmployeeCap", label: "Employee share cap", kind: "peso" },
    ],
  },
  {
    title: "Premiums",
    description:
      "Multipliers for night-shift and holiday work. Overtime is configured separately, under organisation settings.",
    fields: [
      { key: "nightShiftPremium", label: "Night differential", kind: "multiplier", hint: "1.10 = +10%" },
      { key: "nightShiftStartHour", label: "Night window starts", kind: "hour" },
      { key: "nightShiftEndHour", label: "Night window ends", kind: "hour" },
      { key: "regularHolidayWorkedRate", label: "Regular holiday — worked", kind: "multiplier" },
      { key: "regularHolidayUnworkedRate", label: "Regular holiday — not worked", kind: "multiplier" },
      { key: "specialHolidayWorkedRate", label: "Special non-working — worked", kind: "multiplier" },
    ],
  },
  {
    title: "Tax",
    description: "13th-month pay is exempt up to the cap. The BIR table year selects the withholding schedule.",
    fields: [
      { key: "thirteenthMonthExemptionCap", label: "13th-month exemption cap", kind: "peso" },
      { key: "birTaxTableYear", label: "BIR tax table year", kind: "year" },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

/** Stored value → what the admin sees in the input. */
function toDisplay(stored: string | number, kind: FieldKind): string {
  const n = Number(stored);
  if (!Number.isFinite(n)) return "";
  if (kind === "percent") {
    // 0.025 → "2.5". Rounded to kill float noise like 2.4999999999999996.
    return String(Math.round(n * 1_000_000) / 10_000);
  }
  if (kind === "hour" || kind === "year") return String(n);
  return String(n);
}

/** What the admin typed → the value the API expects. */
function toStored(display: string, kind: FieldKind): number | null {
  const n = Number(display);
  if (display.trim() === "" || !Number.isFinite(n)) return null;
  if (kind === "percent") return Math.round((n / 100) * 1_000_000) / 1_000_000;
  return n;
}

function suffixFor(kind: FieldKind): string | null {
  switch (kind) {
    case "percent":
      return "%";
    case "peso":
      return "₱";
    case "multiplier":
      return "×";
    case "hour":
      return "h";
    default:
      return null;
  }
}

/** The form's display values for a given settings row. */
function buildValues(s: PayrollSettings): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of ALL_FIELDS) {
    next[field.key] = toDisplay(s[field.key as keyof PayrollSettings] as string, field.kind);
  }
  return next;
}

export function PayrollSettingsContent() {
  const queryClient = useQueryClient();
  // HR holds payroll_rate:read but not :update — they review the rates behind the
  // payroll they generate. Without this the screen would offer them a Save button
  // that the API answers with a 403.
  const canEdit = useCan("payroll_rate:update");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [hydratedFrom, setHydratedFrom] = useState<PayrollSettings | null>(null);

  const { data: settings, isLoading, refetch, isError } = useQuery({
    queryKey: ["payroll", "settings"],
    queryFn: getPayrollSettings,
  });

  // Seed the form from the server row during render rather than in an effect,
  // keyed on the cached object's *identity*. React Query's structural sharing
  // keeps the same reference when a refetch returns identical data, so a
  // background refetch never stomps what the admin is typing, while a genuine
  // change always re-seeds.
  //
  // Keyed on identity rather than on `version` deliberately: comparing versions
  // re-seeded from the stale cache in the window between a successful save and
  // the refetch landing, which put the pre-save value back in the input.
  if (settings && settings !== hydratedFrom) {
    setValues(buildValues(settings));
    setHydratedFrom(settings);
  }

  const dirtyKeys = useMemo(() => {
    if (!settings) return [];
    return ALL_FIELDS.filter((field) => {
      const original = toDisplay(settings[field.key as keyof PayrollSettings] as string, field.kind);
      return (values[field.key] ?? "") !== original;
    }).map((f) => f.key);
  }, [settings, values]);

  const invalidKeys = useMemo(
    () =>
      ALL_FIELDS.filter(
        (field) => dirtyKeys.includes(field.key) && toStored(values[field.key] ?? "", field.kind) === null,
      ).map((f) => f.key),
    [dirtyKeys, values],
  );

  const saveMutation = useMutation({
    mutationFn: updatePayrollSettings,
    onSuccess: (updated) => {
      // Write the saved row straight into the cache so there is a single source
      // of truth; the render-time seeding above then picks it up. Invalidating
      // without this left the cache holding the pre-save row.
      queryClient.setQueryData(["payroll", "settings"], updated);
      setToast({ message: "Payroll settings saved.", tone: "success" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to save payroll settings.";
      setToast({ message, tone: "error" });
    },
  });

  const handleSave = () => {
    // Send only what changed, so a field this screen does not know about is
    // never silently overwritten with a stale value.
    const payload: PayrollSettingsUpdate = {};
    for (const field of ALL_FIELDS) {
      if (!dirtyKeys.includes(field.key)) continue;
      const stored = toStored(values[field.key] ?? "", field.kind);
      if (stored === null) continue;
      (payload as Record<string, number>)[field.key] = stored;
    }
    saveMutation.mutate(payload);
  };

  const canSave =
    canEdit && dirtyKeys.length > 0 && invalidKeys.length === 0 && !saveMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-brand-navy">Payroll Settings</h1>
        <p className="text-sm text-brand-muted">
          Statutory contribution rates, caps and premium multipliers used to compute payroll and payslips.
        </p>
      </div>

      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full flex items-center justify-center bg-[#f0fdf4]">
              <ShieldCheck className="h-5 w-5 text-[#15803d]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-navy">
                {settings ? `BIR table year ${settings.birTaxTableYear}` : "Philippine compliance"}
              </h2>
              <p className="text-xs text-brand-muted">
                {canEdit
                  ? "Changes apply the next time a payroll period is generated. Payslips already issued keep the figures they were computed with."
                  : "These rates drive payroll and payslip calculations. Only Finance and Admin can change them."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {canEdit ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => settings && setValues(buildValues(settings))}
                  disabled={dirtyKeys.length === 0 || saveMutation.isPending}
                  className="h-8 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Discard
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="h-8 text-xs bg-[#0052cc] hover:bg-[#004bb3]"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saveMutation.isPending
                    ? "Saving..."
                    : dirtyKeys.length > 0
                      ? `Save ${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}`
                      : "Save Changes"}
                </Button>
              </>
            ) : (
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#f4f5f7] text-brand-muted">
                View only
              </span>
            )}
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-[16px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Could not load payroll settings. You may not have permission to view them.
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-[16px] animate-pulse" />
          ))}
        </div>
      ) : (
        SECTIONS.map((section) => (
          <div
            key={section.title}
            className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
          >
            <div className="mb-5">
              <h2 className="text-lg font-bold text-brand-navy">{section.title}</h2>
              <p className="text-xs text-brand-muted mt-1">{section.description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.fields.map((field) => {
                const suffix = suffixFor(field.kind);
                const isDirty = dirtyKeys.includes(field.key);
                const isInvalid = invalidKeys.includes(field.key);
                return (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`payroll-setting-${field.key}`}
                      className="text-xs font-semibold text-brand-navy"
                    >
                      {field.label}
                      {suffix ? <span className="text-brand-muted font-normal"> ({suffix})</span> : null}
                    </label>
                    <Input
                      id={`payroll-setting-${field.key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={values[field.key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      readOnly={!canEdit}
                      aria-invalid={isInvalid}
                      className={
                        isInvalid
                          ? "border-red-400 focus-visible:ring-red-300"
                          : isDirty
                            ? "border-[#0052cc]"
                            : undefined
                      }
                    />
                    <span className="text-[11px] text-brand-muted min-h-[14px]">
                      {isInvalid ? "Enter a number." : (field.hint ?? "")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
