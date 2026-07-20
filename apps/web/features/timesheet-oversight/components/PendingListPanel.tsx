"use client";

import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import type { TimesheetRow } from "../api/timesheet-oversight.service";

interface PendingListPanelProps {
  items: TimesheetRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function PendingListPanel({ items, selectedId, onSelect, loading }: PendingListPanelProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[12px] border border-[#c3c6d2]/40 bg-white p-4" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[12px] border border-[#c3c6d2]/40 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-brand-muted">No pending timesheets</p>
        <p className="mt-1 text-xs text-brand-muted/70">All team timesheets have been processed.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const { label, tone } = timesheetStatusTone(item.status);
        const name = `${item.user.firstName} ${item.user.lastName}`;
        const periodStartStr = formatDate(item.periodStart);
        const periodEndStr = formatDate(item.periodEnd);
        
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`flex flex-col text-left p-4 rounded-[12px] border transition-all duration-200 ${
              isSelected
                ? "border-brand bg-brand/5 shadow-[0px_4px_12px_rgba(26,115,232,0.08)] ring-1 ring-brand"
                : "border-[#c3c6d2]/50 bg-white hover:border-[#c3c6d2] hover:bg-slate-50/50"
            }`}
          >
            <div className="flex items-center gap-3 w-full">
              <Avatar firstName={item.user.firstName} lastName={item.user.lastName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-brand-ink truncate">{name}</p>
                <p className="text-xs text-brand-muted truncate">{item.user.department?.name ?? "No Department"}</p>
              </div>
              <StatusBadge label={label} tone={tone} className="shrink-0" />
            </div>
            
            <div className="mt-3 flex items-center justify-between border-t border-[#c3c6d2]/20 pt-2.5 w-full">
              <div className="text-xs text-brand-muted">
                <span className="font-medium text-brand-ink">{periodStartStr}</span> – <span className="font-medium text-brand-ink">{periodEndStr}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {item.overtimeMinutes && item.overtimeMinutes > 0 ? (
                  <span
                    className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"
                    title="Overtime — hours worked beyond 8h/day, this period"
                  >
                    OT {formatHours(item.overtimeMinutes)}h
                  </span>
                ) : null}
                <div className="text-xs font-bold text-brand bg-brand-cyan/15 px-2 py-0.5 rounded-full">
                  {formatHours(item.totalMinutes)} hrs
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
