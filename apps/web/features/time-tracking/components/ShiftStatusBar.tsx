"use client";

import { Clock3 } from "lucide-react";
import type { ShiftLimitStatus } from "../api/work-sessions.service";
import { cn } from "@/lib/utils";

function hoursLabel(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Section 1a — how much of the configured shift limit is used. Rendered only
 * for limit-enforced sessions; an org with no shift configuration sees nothing,
 * exactly as before this feature.
 */
export function ShiftStatusBar({ status }: { status: ShiftLimitStatus }) {
  if (status.state === "UNLIMITED" || status.maxShiftMinutes === null) return null;

  const pct = Math.min(100, Math.round((status.elapsedMinutes / status.maxShiftMinutes) * 100));
  const past = status.state === "LIMIT_REACHED" || status.state === "EXPIRED";
  const warning = status.state === "WARNING";

  return (
    <div className="mt-5 w-full">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          Shift limit — {hoursLabel(status.maxShiftMinutes)}
        </span>
        <span className={cn(past && "text-red-600", warning && "text-amber-600")}>
          {past
            ? `${hoursLabel(status.remainingMinutes ?? 0)} over`
            : `${hoursLabel(status.remainingMinutes ?? 0)} left`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Shift limit usage: ${pct}% of ${hoursLabel(status.maxShiftMinutes)}`}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#eef0f4]"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            past ? "bg-red-500" : warning ? "bg-amber-500" : "bg-brand",
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      <p className="mt-1 text-[11px] text-brand-muted">
        {hoursLabel(status.elapsedMinutes)} elapsed since clock-in (breaks included).
      </p>
    </div>
  );
}
