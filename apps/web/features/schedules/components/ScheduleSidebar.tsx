"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { getConflicts, getRequests, type EfficiencyDay } from "../api/schedules.service";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function ScheduleConflictPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["schedules", "conflicts"],
    queryFn: () => getConflicts(),
    refetchInterval: 5_000,
  });
  const conflicts = data ?? [];

  return (
    <SectionCard title="Schedule Conflicts">
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : conflicts.length === 0 ? (
        <EmptyState message="No overlapping shifts detected." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {conflicts.map((c) => (
            <div key={`${c.shiftAId}-${c.shiftBId}`} className="flex items-start gap-2 rounded-[10px] bg-red-50 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="font-bold text-red-700">{c.employeeName}</p>
                <p className="text-xs text-red-600">
                  Overlap {formatDate(c.overlapStart)}, {formatTime(c.overlapStart)}–{formatTime(c.overlapEnd)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PendingRequestsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["schedules", "requests"],
    queryFn: () => getRequests({ limit: 10 }),
    refetchInterval: 5_000,
  });
  const rows = data?.data ?? [];

  return (
    <SectionCard title="Pending Requests">
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No drafts awaiting publish." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
              <p className="font-bold text-amber-800">{r.user.firstName} {r.user.lastName}</p>
              <p className="text-xs text-amber-700">
                {formatDate(r.shiftDate)} · {formatTime(r.startTime)}–{formatTime(r.endTime)}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function WeeklyEfficiencyPanel({ efficiency }: { efficiency: EfficiencyDay[] }) {
  return (
    <SectionCard title="Weekly Efficiency">
      {efficiency.every((d) => d.scheduledHours === 0) ? (
        <EmptyState message="No scheduled hours yet this week." />
      ) : (
        <div className="flex flex-col gap-3">
          {efficiency.map((d) => {
            const pct = d.scheduledHours > 0 ? Math.min(100, Math.round((d.workedHours / d.scheduledHours) * 100)) : 0;
            return (
              <div key={d.date} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-brand-ink">
                    {new Date(d.date).toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="text-brand-muted">
                    {d.workedHours}h / {d.scheduledHours}h
                  </span>
                </div>
                <ProgressBar percent={pct} barClassName={pct < 80 ? "bg-amber-500" : undefined} label={`Efficiency ${d.date}`} />
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function ScheduleSidebar({ efficiency, canManage }: { efficiency: EfficiencyDay[]; canManage: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <>
          <ScheduleConflictPanel />
          <PendingRequestsPanel />
        </>
      ) : null}
      <WeeklyEfficiencyPanel efficiency={efficiency} />
    </div>
  );
}
