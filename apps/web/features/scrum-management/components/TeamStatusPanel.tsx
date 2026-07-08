"use client";

import { AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import type { ScrumDashboard } from "../api/scrum-management.service";

function statusTone(completionPercent: number, hasActiveBlocker: boolean): { label: string; tone: BadgeTone } {
  if (hasActiveBlocker) return { label: "Blocked", tone: "danger" };
  if (completionPercent >= 100) return { label: "On Time", tone: "success" };
  if (completionPercent > 0) return { label: "In Progress", tone: "info" };
  return { label: "Not Started", tone: "neutral" };
}

export function TeamStatusPanel({ data, isLoading }: { data: ScrumDashboard | undefined; isLoading: boolean }) {
  const teams = data?.teamStatus ?? [];

  return (
    <SectionCard title="Team Status">
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : teams.length === 0 ? (
        <EmptyState message="No teams in scope yet." />
      ) : (
        <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
          {teams.map((t) => {
            const { label, tone } = statusTone(t.completionPercent, t.hasActiveBlocker);
            return (
              <li key={t.teamId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {t.hasActiveBlocker ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" /> : null}
                  <span className="truncate text-sm font-medium text-brand-navy">{t.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-brand-muted">{t.submittedCount}/{t.memberCount} submitted</span>
                  <StatusBadge label={label} tone={tone} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
