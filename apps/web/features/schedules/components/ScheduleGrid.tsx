"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { ApiError } from "@/lib/api/client";
import { deleteShift, updateShift, type CalendarEmployee } from "../api/schedules.service";
import type { ToastState } from "@/components/shared/Toast";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayKeyFromWeekStart(weekStart: string, offset: number): string {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

interface ScheduleGridProps {
  weekStart: string;
  employees: CalendarEmployee[];
  isLoading: boolean;
  view: "week" | "day";
  selectedDay: string;
  onToast: (t: ToastState) => void;
  canManage: boolean;
}

function ShiftCard({
  shift,
  onToast,
  canManage,
}: {
  shift: CalendarEmployee["shifts"][number];
  onToast: (t: ToastState) => void;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const publish = useMutation({
    mutationFn: () => updateShift(shift.id, { status: "PUBLISHED", version: shift.version }),
    onSuccess: () => {
      onToast({ message: "Shift published.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not publish.", tone: "error" }),
  });

  const remove = useMutation({
    mutationFn: () => deleteShift(shift.id, shift.version),
    onSuccess: () => {
      onToast({ message: "Shift removed.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not remove shift.", tone: "error" }),
  });

  const isDraft = shift.status === "DRAFT";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-[8px] border px-2.5 py-2 text-xs",
        shift.conflict
          ? "border-red-300 bg-red-50"
          : isDraft
            ? "border-amber-300 bg-amber-50"
            : "border-[#c3c6d2]/60 bg-[#f0fdf4]",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-bold text-brand-ink">{formatHour(shift.startTime)}–{formatHour(shift.endTime)}</span>
        {shift.conflict ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" /> : null}
      </div>
      <span className={cn("font-bold uppercase tracking-wide", isDraft ? "text-amber-700" : "text-[#16a34a]")}>
        {isDraft ? "Draft" : "Approved"}
      </span>
      {shift.notes ? <span className="truncate text-brand-muted" title={shift.notes}>{shift.notes}</span> : null}
      {canManage ? (
        <div className="mt-1 flex items-center gap-1.5">
          {isDraft ? (
            <button
              type="button"
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              aria-label="Publish shift"
              className="flex h-6 items-center gap-1 rounded-[6px] bg-brand px-1.5 text-[10px] font-bold text-white hover:bg-[#1467d6] disabled:opacity-50"
            >
              {publish.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label="Remove shift"
            className="flex h-6 items-center gap-1 rounded-[6px] border border-[#c3c6d2]/60 px-1.5 text-[10px] font-bold text-brand-muted hover:bg-white disabled:opacity-50"
          >
            {remove.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ScheduleGrid({ weekStart, employees, isLoading, view, selectedDay, onToast, canManage }: ScheduleGridProps) {
  const days = Array.from({ length: 7 }, (_, i) => ({
    label: DAY_LABELS[i],
    key: dayKeyFromWeekStart(weekStart, i),
  })).filter((d) => view === "week" || d.key === selectedDay);

  if (isLoading) return <p className="text-sm text-brand-muted">Loading…</p>;
  if (employees.length === 0) {
    return <EmptyState message="No shifts scheduled for this week yet. Use Add Shift to get started." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="bg-[#f6f3f4]">
            <th className="w-40 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Employee</th>
            {days.map((d) => (
              <th key={d.key} className="px-3 py-2.5 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">
                {d.label} <span className="font-normal normal-case">{d.key.slice(5)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.userId} className="border-b border-[#c3c6d2]/40 align-top">
              <td className="px-3 py-3">
                <p className="text-sm font-bold text-brand-ink">{emp.name}</p>
                <p className="text-xs text-brand-muted">{emp.department ?? "—"}</p>
              </td>
              {days.map((d) => (
                <td key={d.key} className="min-w-[140px] px-2 py-3">
                  <div className="flex flex-col gap-2">
                    {emp.shifts
                      .filter((s) => s.shiftDate.slice(0, 10) === d.key)
                      .map((s) => (
                        <ShiftCard key={s.id} shift={s} onToast={onToast} canManage={canManage} />
                      ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
