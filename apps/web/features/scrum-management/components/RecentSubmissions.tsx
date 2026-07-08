"use client";

import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Avatar } from "@/components/shared/Avatar";
import type { ScrumDashboard } from "../api/scrum-management.service";

function submissionTone(completionPercent: number): { label: string; tone: BadgeTone } {
  if (completionPercent >= 100) return { label: "On Time", tone: "success" };
  if (completionPercent > 0) return { label: "Lagging", tone: "warning" };
  return { label: "Missing", tone: "danger" };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RecentSubmissions({ data, isLoading }: { data: ScrumDashboard | undefined; isLoading: boolean }) {
  const rows = data?.recentSubmissions ?? [];

  return (
    <SectionCard title="Recent Submissions">
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No submissions yet in this scope." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="pb-2 pr-4">Department</th>
                <th className="pb-2 pr-4">Employee</th>
                <th className="pb-2 pr-4">Completion %</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {rows.map((r) => {
                const { label, tone } = submissionTone(r.completionPercent);
                const [firstName, ...rest] = r.name.split(" ");
                return (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 text-brand-muted">{r.department ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Avatar firstName={firstName} lastName={rest.join(" ")} size="sm" />
                        <span className="font-medium text-brand-ink">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e4e2e3]">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${r.completionPercent}%` }} />
                        </div>
                        <span className="text-xs text-brand-muted">{r.completionPercent}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4"><StatusBadge label={label} tone={tone} /></td>
                    <td className="py-2.5 text-brand-muted">{formatTime(r.submittedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
