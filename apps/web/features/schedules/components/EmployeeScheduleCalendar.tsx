"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCalendar, type ShiftRow } from "../api/schedules.service";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/** ISO week start (Monday) for a given date. */
function weekStartOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Generate all ISO week-start dates that touch a given month. */
function weeksInMonth(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const starts: string[] = [];
  let cursor = weekStartOf(first);
  const lastWeekStart = weekStartOf(last);
  while (cursor <= lastWeekStart) {
    starts.push(cursor);
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() + 7);
    cursor = d.toISOString().slice(0, 10);
  }
  return starts;
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const MONTH_LABEL = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric" });

interface ShiftByDate {
  [date: string]: (ShiftRow & { conflict: boolean })[];
}

export function EmployeeScheduleCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());

  const weekStarts = useMemo(() => weeksInMonth(year, month), [year, month]);

  const weekQueries = useQueries({
    queries: weekStarts.map((ws) => ({
      queryKey: ["schedules", "calendar", ws],
      queryFn: () => getCalendar({ weekStart: ws }),
    })),
  });

  const isLoading = weekQueries.some((q) => q.isLoading);

  // Merge all shifts from all weeks into a date-keyed map.
  const shiftsByDate: ShiftByDate = useMemo(() => {
    const map: ShiftByDate = {};
    for (const q of weekQueries) {
      if (!q.data) continue;
      for (const emp of q.data.employees) {
        for (const s of emp.shifts) {
          const key = s.shiftDate.slice(0, 10);
          if (!map[key]) map[key] = [];
          map[key].push(s as ShiftByDate[string][number]);
        }
      }
    }
    return map;
  }, [weekQueries]);

  // Build the calendar grid (6 rows × 7 cols max).
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstDay = startOfMonth(new Date(Date.UTC(year, month, 1)));
  const lastDay = endOfMonth(new Date(Date.UTC(year, month, 1)));
  const startDow = (firstDay.getUTCDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getUTCDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Month navigator */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-brand-ink">{MONTH_LABEL(year, month)}</span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-brand-muted py-8 text-center">Loading schedule…</p>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-[#c3c6d2]/30 rounded-[12px] overflow-hidden border border-[#c3c6d2]/30">
          {/* Day headers */}
          {DAY_NAMES.map((name) => (
            <div key={name} className="bg-[#f6f3f4] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-brand-muted">
              {name}
            </div>
          ))}

          {/* Day cells */}
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="bg-white min-h-[90px]" />;
            }
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const dayShifts = shiftsByDate[dateStr] ?? [];

            return (
              <div
                key={dateStr}
                className={cn(
                  "bg-white min-h-[90px] px-2 py-1.5 flex flex-col gap-1",
                  isToday && "bg-brand/5",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                    isToday ? "bg-brand text-white" : "text-brand-ink",
                  )}
                >
                  {day}
                </span>
                {dayShifts.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
                      s.status === "DRAFT"
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-[#c3c6d2]/60 bg-[#f0fdf4] text-[#16a34a]",
                    )}
                  >
                    {formatHour(s.startTime)} – {formatHour(s.endTime)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
