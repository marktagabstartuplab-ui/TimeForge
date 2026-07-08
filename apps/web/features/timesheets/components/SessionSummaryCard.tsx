"use client";

import { CheckCircle2, Clock3, Coffee, LogIn, LogOut, Zap } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import type { DaySummary } from "@/features/time-tracking/lib/day-summary";
import { formatClockTime, formatMinutes } from "@/lib/time";

interface SessionSummaryCardProps {
  summary: DaySummary;
  /** True when the break-start flag is set in localStorage. */
  onBreak: boolean;
  loading: boolean;
}

interface SessionStatus {
  label: string;
  tone: BadgeTone;
  icon: React.ReactNode;
  description: string;
}

function resolveStatus(summary: DaySummary, onBreak: boolean): SessionStatus {
  if (summary.entryCount === 0) {
    return {
      label: "No Session Yet",
      tone: "neutral",
      icon: <Clock3 className="h-4 w-4" aria-hidden="true" />,
      description: "Clock in from the Daily Scrum page to start your session.",
    };
  }
  if (summary.running) {
    return {
      label: "In Progress",
      tone: "success",
      icon: <Zap className="h-4 w-4" aria-hidden="true" />,
      description: "Your session is currently running.",
    };
  }
  if (onBreak) {
    return {
      label: "On Break",
      tone: "warning",
      icon: <Coffee className="h-4 w-4" aria-hidden="true" />,
      description: "You are currently on break.",
    };
  }
  if (summary.clockOutAt) {
    return {
      label: "Ready for Submission",
      tone: "info",
      icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
      description: "Session completed — review and submit your timesheet below.",
    };
  }
  return {
    label: "Session Ended",
    tone: "neutral",
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    description: "Your session has ended.",
  };
}


const TODAY_DAY = new Date().toLocaleDateString("en-US", { weekday: "long" });
const TODAY_DATE = new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15 text-brand">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-brand-muted">{label}</p>
        <p className="truncate text-sm font-semibold text-brand-ink">{value}</p>
      </div>
    </div>
  );
}

/** Auto-generated Session Summary Card — top of the Smart Timesheet. */
export function SessionSummaryCard({ summary, onBreak, loading }: SessionSummaryCardProps) {
  const status = resolveStatus(summary, onBreak);

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Header band */}
      <div className="flex items-start justify-between gap-4 bg-brand px-[25px] py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-white/70">Today&apos;s Session</p>
          <p className="mt-0.5 text-[22px] font-bold leading-tight text-white">{TODAY_DAY}</p>
          <p className="text-sm text-white/80">{TODAY_DATE}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
          <StatusBadge
            label={status.label}
            tone={status.tone}
            className="bg-white/20 text-white ring-1 ring-white/30"
          />
        </div>
      </div>

      {/* Body */}
      <div className="p-[25px]">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-[10px] bg-[#f6f3f4]" />
            ))}
          </div>
        ) : summary.entryCount === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f6f3f4] text-brand-muted">
              <Clock3 className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-brand-ink">No session recorded today</p>
            <p className="text-xs text-brand-muted">
              Use the Daily Scrum page to clock in and start your shift.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <InfoRow
              icon={<LogIn className="h-4 w-4" aria-hidden="true" />}
              label="Clock In"
              value={summary.clockInAt ? formatClockTime(summary.clockInAt) : "—"}
            />
            <InfoRow
              icon={<LogOut className="h-4 w-4" aria-hidden="true" />}
              label="Clock Out"
              value={
                summary.clockOutAt
                  ? formatClockTime(summary.clockOutAt)
                  : summary.running
                    ? "In progress"
                    : onBreak
                      ? "On break"
                      : "—"
              }
            />
            <InfoRow
              icon={<Coffee className="h-4 w-4" aria-hidden="true" />}
              label={`Break Time${summary.breakCount > 0 ? ` (${summary.breakCount})` : ""}`}
              value={summary.breakMinutes > 0 ? formatMinutes(summary.breakMinutes) : "No breaks"}
            />
            <InfoRow
              icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
              label="Total Worked"
              value={summary.trackedMinutes > 0 ? formatMinutes(summary.trackedMinutes) : "—"}
            />
          </div>
        )}

        {/* Status description */}
        {!loading && summary.entryCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-[#f6f3f4] px-4 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
              {status.icon}
            </span>
            <p className="text-xs text-brand-muted">{status.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
