"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { listRecurringIssues } from "../api/recurring-issues.service";
import { listDepartments } from "@/features/schedules/api/departments-picker.service";
import { listProjects } from "@/features/time-tracking/api/catalog.service";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const TREND_ICON = {
  INCREASING: TrendingUp,
  DECREASING: TrendingDown,
  STABLE: Minus,
} as const;

const TREND_TONE: Record<string, "success" | "danger" | "neutral"> = {
  INCREASING: "danger",
  DECREASING: "success",
  STABLE: "neutral",
};

/**
 * "Recurring Operational Issues" panel — shared across Supervisor Dashboard,
 * Supervisor AI Insights, Admin Dashboard summary, and the Daily Scrum detail
 * page. Backed by the deterministic worker sweep in
 * recurring-issue-detection.processor.ts (separate from AI blocker detection).
 */
export function RecurringIssuesPanel() {
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: departments } = useQuery({ queryKey: ["catalog", "departments"], queryFn: listDepartments });
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });

  const query = useMemo(
    () => ({
      departmentId: departmentId || undefined,
      projectId: projectId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [departmentId, projectId, from, to],
  );

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["recurring-issues", query],
    queryFn: () => listRecurringIssues(query),
  });

  const departmentName = (id: string | null) => (id && departments?.find((d) => d.id === id)?.name) || "—";
  const projectName = (id: string | null) => (id && projects?.find((p) => p.id === id)?.name) || "—";

  return (
    <SectionCard title="Recurring Operational Issues">
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-3">
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="h-9 rounded-lg border border-[#c3c6d2] bg-white px-2.5 text-xs font-semibold text-brand-navy"
        >
          <option value="">All Departments</option>
          {(departments ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 rounded-lg border border-[#c3c6d2] bg-white px-2.5 text-xs font-semibold text-brand-navy"
        >
          <option value="">All Projects</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 rounded-lg border border-[#c3c6d2] bg-white px-2.5 text-xs font-semibold text-brand-navy"
          aria-label="From date"
        />
        <span className="text-xs text-brand-muted">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 rounded-lg border border-[#c3c6d2] bg-white px-2.5 text-xs font-semibold text-brand-navy"
          aria-label="To date"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : issues.length === 0 ? (
        <EmptyState message="No recurring issues detected in the selected range — great sign." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                <th className="py-2.5 px-3">Issue</th>
                <th className="py-2.5 px-3">Frequency</th>
                <th className="py-2.5 px-3">Employees</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Project</th>
                <th className="py-2.5 px-3">First Seen</th>
                <th className="py-2.5 px-3">Last Seen</th>
                <th className="py-2.5 px-3">Trend</th>
                <th className="py-2.5 px-3">Suggested Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/25">
              {issues.map((issue) => {
                const TrendIcon = TREND_ICON[issue.trend];
                return (
                  <tr key={issue.id} className="hover:bg-gray-50/50 transition-colors align-top">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 font-semibold text-brand-navy">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="max-w-[220px] truncate">{issue.issueText}</span>
                      </div>
                      <StatusBadge label={issue.category} tone={issue.category === "BLOCKER" ? "danger" : "info"} className="mt-1" />
                    </td>
                    <td className="py-3 px-3 font-bold text-brand-navy">{issue.occurrenceCount}×</td>
                    <td className="py-3 px-3 text-brand-muted">{issue.employeeIds.length}</td>
                    <td className="py-3 px-3 text-brand-muted">{departmentName(issue.departmentId)}</td>
                    <td className="py-3 px-3 text-brand-muted">{projectName(issue.projectId)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-brand-muted">{formatDate(issue.firstOccurrence)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-brand-muted">{formatDate(issue.lastOccurrence)}</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1">
                        <TrendIcon className="h-3.5 w-3.5" />
                        <StatusBadge label={issue.trend} tone={TREND_TONE[issue.trend]} />
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-[260px] text-xs text-brand-muted">{issue.suggestedAction || "—"}</td>
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
