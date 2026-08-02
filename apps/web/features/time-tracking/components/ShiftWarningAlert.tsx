"use client";

import { AlertTriangle, Hourglass, ShieldAlert } from "lucide-react";
import type { ShiftLimitStatus } from "../api/work-sessions.service";
import { cn } from "@/lib/utils";

interface ShiftWarningAlertProps {
  status: ShiftLimitStatus;
  /** Opens the override request form. Omitted when the employee can't request one. */
  onRequestOverride?: () => void;
}

function hoursLabel(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  if (h === 0) return `${m} minutes`;
  return m === 0 ? `${h} hours` : `${h}h ${m}m`;
}

/**
 * Escalating banner for a session approaching or past its shift limit:
 * amber inside the warning window, red once the limit is crossed.
 */
export function ShiftWarningAlert({ status, onRequestOverride }: ShiftWarningAlertProps) {
  if (status.state === "UNLIMITED" || status.state === "OK") return null;

  const past = status.state === "LIMIT_REACHED" || status.state === "EXPIRED";
  const pending = Boolean(status.pendingOverrideId);

  return (
    <div
      role="alert"
      className={cn(
        "mt-4 flex flex-col gap-3 rounded-[10px] border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between",
        past ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5", past ? "text-red-600" : "text-amber-600")} aria-hidden="true">
          {past ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className={cn("text-sm font-bold", past ? "text-red-700" : "text-amber-700")}>
            {past ? "Shift limit reached" : "Approaching your shift limit"}
          </p>
          <p className={cn("mt-0.5 text-xs", past ? "text-red-600" : "text-amber-700")}>
            {past
              ? `You have been clocked in for ${hoursLabel(status.elapsedMinutes)}, past your ${hoursLabel(
                  status.maxShiftMinutes ?? 0,
                )} limit. You will be clocked out automatically.`
              : `You have been clocked in for ${hoursLabel(status.elapsedMinutes)}. Your ${hoursLabel(
                  status.maxShiftMinutes ?? 0,
                )} limit is reached in ${hoursLabel(status.remainingMinutes ?? 0)}.`}
          </p>
          {pending ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-brand-muted">
              <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
              Extension request awaiting your supervisor&rsquo;s decision.
            </p>
          ) : null}
        </div>
      </div>

      {onRequestOverride && status.requiresSupervisorOverride && !pending ? (
        <button
          type="button"
          onClick={onRequestOverride}
          className={cn(
            "h-9 shrink-0 rounded-[8px] px-4 text-xs font-bold text-white transition-colors",
            past ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700",
          )}
        >
          Request extension
        </button>
      ) : null}
    </div>
  );
}
