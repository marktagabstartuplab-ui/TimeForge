"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import { adjustTimesheet, type TimesheetDetail } from "../api/timesheet-oversight.service";
import type { ToastState } from "@/components/shared/Toast";

const REGULAR_DAY_MINUTES = 8 * 60;

interface RowState {
  id: string;
  /** `datetime-local` values — local wall-clock, converted to ISO on submit. */
  start: string;
  end: string;
  /** Total Hours as typed, in decimal hours. */
  hours: string;
  label: string;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function minutesBetween(start: string, end: string): number | null {
  const s = fromLocalInput(start);
  const e = fromLocalInput(end);
  if (!s || !e) return null;
  const diff = (new Date(e).getTime() - new Date(s).getTime()) / 60_000;
  return diff > 0 ? Math.round(diff) : null;
}

function hoursToMinutes(hours: string): number {
  const parsed = Number(hours);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : 0;
}

function buildRows(detail: TimesheetDetail): RowState[] {
  return detail.entries.map((e) => ({
    id: e.id,
    start: toLocalInput(e.startTime),
    end: toLocalInput(e.endTime),
    hours: ((e.durationMinutes ?? 0) / 60).toFixed(2),
    label: e.task || e.description || "General work",
  }));
}

/**
 * Supervisor-only correction of an employee's submitted hours (BUG-Q).
 *
 * This is not the employee's own edit form — it posts to the dedicated
 * /timesheets/:id/adjust endpoint, refuses to submit without a reason, and every
 * save lands in the audit trail as a supervisor override with before/after
 * values. The employee's own editing rules are untouched.
 */
export function AdjustHoursModal({
  open,
  onOpenChange,
  detail,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: TimesheetDetail;
  onToast: (t: ToastState) => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RowState[]>(() => buildRows(detail));
  const [reason, setReason] = useState("");
  const [overtimeMode, setOvertimeMode] = useState<"auto" | "manual">(
    detail.overtimeMinutesOverride != null ? "manual" : "auto",
  );
  const [overtimeHours, setOvertimeHours] = useState(
    ((detail.overtimeMinutesOverride ?? 0) / 60).toFixed(2),
  );
  const [serverError, setServerError] = useState<string | null>(null);

  // Re-seed from the record whenever the dialog is (re)opened, so a cancelled
  // edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setRows(buildRows(detail));
    setReason("");
    setServerError(null);
    setOvertimeMode(detail.overtimeMinutesOverride != null ? "manual" : "auto");
    setOvertimeHours(((detail.overtimeMinutesOverride ?? 0) / 60).toFixed(2));
  }, [open, detail]);

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        // Editing the clock times re-derives Total Hours; editing Total Hours
        // directly leaves the times alone (an unlogged break, say).
        if (patch.start !== undefined || patch.end !== undefined) {
          const mins = minutesBetween(next.start, next.end);
          if (mins !== null) next.hours = (mins / 60).toFixed(2);
        }
        return next;
      }),
    );
  };

  const preview = useMemo(() => {
    const totalMinutes = rows.reduce((acc, r) => acc + hoursToMinutes(r.hours), 0);

    const byDay = new Map<string, number>();
    for (const row of rows) {
      const iso = fromLocalInput(row.start);
      if (!iso) continue;
      const key = iso.slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + hoursToMinutes(row.hours));
    }
    let derivedOvertime = 0;
    for (const minutes of byDay.values()) {
      if (minutes > REGULAR_DAY_MINUTES) derivedOvertime += minutes - REGULAR_DAY_MINUTES;
    }

    const overtimeMinutes =
      overtimeMode === "manual" ? hoursToMinutes(overtimeHours) : derivedOvertime;

    return { totalMinutes, derivedOvertime, overtimeMinutes };
  }, [rows, overtimeMode, overtimeHours]);

  const overtimeExceedsTotal = preview.overtimeMinutes > preview.totalMinutes;
  const canSave = reason.trim().length > 0 && !overtimeExceedsTotal;

  const changedEntries = useMemo(() => {
    const original = new Map(buildRows(detail).map((r) => [r.id, r] as const));
    return rows.filter((row) => {
      const before = original.get(row.id);
      if (!before) return false;
      return before.start !== row.start || before.end !== row.end || before.hours !== row.hours;
    });
  }, [rows, detail]);

  const submit = useMutation({
    mutationFn: () =>
      adjustTimesheet(detail.id, {
        expectedVersion: detail.version,
        reason: reason.trim(),
        entries: changedEntries.map((row) => ({
          entryId: row.id,
          startTime: fromLocalInput(row.start) ?? undefined,
          endTime: fromLocalInput(row.end) ?? undefined,
          durationMinutes: hoursToMinutes(row.hours),
        })),
        overtimeMinutesOverride:
          overtimeMode === "manual" ? hoursToMinutes(overtimeHours) : null,
      }),
    onSuccess: () => {
      onToast({ message: "Timesheet adjusted — the change is recorded in the audit log.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["timesheet-oversight"] });
      onOpenChange(false);
    },
    onError: (err) =>
      setServerError(err instanceof ApiError ? err.message : "Could not save the adjustment."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="w-[min(860px,calc(100vw-2rem))]">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle className="text-xl">Adjust Hours</DialogTitle>
            <DialogDescription>
              Correcting {detail.user.firstName} {detail.user.lastName}&rsquo;s submitted record for{" "}
              {detail.periodStart.slice(0, 10)} – {detail.periodEnd.slice(0, 10)}.
            </DialogDescription>
          </div>
          <DialogCloseButton />
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
          {serverError ? <FormBanner message={serverError} /> : null}

          <div className="flex items-start gap-2.5 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are editing another person&rsquo;s time record. The change is logged against your
              name with the before and after values and the reason you give below, and the employee
              is notified.
            </p>
          </div>

          {/* Entry grid */}
          <div className="overflow-x-auto rounded-[12px] border border-[#c3c6d2]/40">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-slate-50 text-brand-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider">Task</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider">Time In</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider">Time Out</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider">Total Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/25">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-brand-muted">
                      This timesheet has no entries to adjust.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="max-w-[180px] truncate px-3 py-2 font-medium text-brand-ink">
                        {row.label}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="datetime-local"
                          aria-label={`Time In for ${row.label}`}
                          value={row.start}
                          onChange={(e) => updateRow(row.id, { start: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="datetime-local"
                          aria-label={`Time Out for ${row.label}`}
                          value={row.end}
                          onChange={(e) => updateRow(row.id, { end: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          max="24"
                          step="0.25"
                          aria-label={`Total Hours for ${row.label}`}
                          className="w-24"
                          value={row.hours}
                          onChange={(e) => updateRow(row.id, { hours: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Overtime */}
          <div className="rounded-[12px] border border-[#c3c6d2]/40 p-3.5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-muted">Overtime</p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-brand-ink">
                <input
                  type="radio"
                  name="overtime-mode"
                  checked={overtimeMode === "auto"}
                  onChange={() => setOvertimeMode("auto")}
                />
                Calculate from hours above ({(preview.derivedOvertime / 60).toFixed(2)}h)
              </label>
              <label className="flex items-center gap-2 text-xs text-brand-ink">
                <input
                  type="radio"
                  name="overtime-mode"
                  checked={overtimeMode === "manual"}
                  onChange={() => setOvertimeMode("manual")}
                />
                Set explicitly
              </label>
              {overtimeMode === "manual" ? (
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  aria-label="Overtime hours"
                  className="w-24"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(e.target.value)}
                />
              ) : null}
            </div>
            {overtimeExceedsTotal ? (
              <p className="mt-2 text-xs font-semibold text-red-600">
                Overtime cannot exceed the total hours on this timesheet.
              </p>
            ) : null}
          </div>

          {/* Preview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[12px] border border-[#c3c6d2]/40 bg-brand/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                Total after adjustment
              </p>
              <p className="text-lg font-black text-brand-ink">
                {(preview.totalMinutes / 60).toFixed(2)}h
              </p>
              <p className="text-[10px] text-brand-muted">
                was {(detail.entries.reduce((a, e) => a + (e.durationMinutes ?? 0), 0) / 60).toFixed(2)}h
              </p>
            </div>
            <div className="rounded-[12px] border border-[#c3c6d2]/40 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                Overtime after adjustment
              </p>
              <p className="text-lg font-black text-brand-ink">
                {(preview.overtimeMinutes / 60).toFixed(2)}h
              </p>
              <p className="text-[10px] text-brand-muted">
                {overtimeMode === "manual" ? "Set by you" : "Derived at >8h/day"}
              </p>
            </div>
          </div>

          {/* Reason — required */}
          <div>
            <Label htmlFor="adjust-reason" className="mb-1.5">
              Reason for adjustment <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="adjust-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Employee forgot to clock out on Jul 20; confirmed 9:00am–5:00pm in our 1:1."
              className="bg-white text-sm"
            />
            <p className="mt-1 text-[11px] text-brand-muted">
              Required. Stored with the adjustment in the audit log.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => submit.mutate()}
              disabled={!canSave || submit.isPending}
            >
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save Adjustment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
