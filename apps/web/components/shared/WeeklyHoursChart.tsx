"use client";

import { cn } from "@/lib/utils";

export interface DayHours {
  /** Short label, e.g. "Mon". */
  label: string;
  hours: number;
  /** Highlight the current day. */
  isToday?: boolean;
}

interface WeeklyHoursChartProps {
  days: DayHours[];
  /** Chart height in px (bars area). */
  height?: number;
  className?: string;
}

/**
 * Dependency-free vertical bar chart for tracked hours per day. Used on the
 * Payslips page and the Reports weekly trend.
 */
export function WeeklyHoursChart({ days, height = 180, className }: WeeklyHoursChartProps) {
  const max = Math.max(8, ...days.map((d) => d.hours));
  return (
    <div className={cn("flex w-full items-end gap-2 sm:gap-4", className)} style={{ height: height + 28 }}>
      {days.map((day) => {
        const barPct = day.hours <= 0 ? 0 : Math.max(4, (day.hours / max) * 100);
        return (
          <div key={day.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            {day.hours > 0 ? (
              <span className="text-[11px] font-semibold text-brand-muted">{day.hours.toFixed(1)}h</span>
            ) : null}
            <div
              role="img"
              aria-label={`${day.label}: ${day.hours.toFixed(1)} hours`}
              className={cn(
                "w-full max-w-10 rounded-t-[6px]",
                day.hours > 0 ? (day.isToday ? "bg-brand" : "bg-brand-cyan/60") : "bg-[#f6f3f4]",
              )}
              style={{ height: `${(barPct / 100) * height}px`, minHeight: day.hours > 0 ? 4 : 2 }}
            />
            <span
              className={cn(
                "text-xs uppercase tracking-wide",
                day.isToday ? "font-bold text-brand" : "text-brand-muted",
              )}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
