"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "@/components/shared/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { getOrgAnalytics, getOrgHierarchy } from "../api/org-management.service";

const AXIS_STYLE = { fontSize: 11, fill: "var(--brand-muted)" };
const GRID_STROKE = "#c3c6d2";

export function OrgAnalyticsCharts() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["org-management", "analytics"],
    queryFn: getOrgAnalytics,
  });
  const { data: hierarchy, isLoading: hierarchyLoading } = useQuery({
    queryKey: ["org-management", "hierarchy"],
    queryFn: getOrgHierarchy,
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SectionCard title="Department Distribution">
        {analyticsLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.departmentDistribution ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip formatter={(v) => [String(v), "Employees"]} />
                <Bar dataKey="employeeCount" fill="var(--brand-cyan)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Resource Allocation">
        {analyticsLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.resourceAllocation ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip formatter={(v) => [`${v} hrs`, "Last 30 days"]} />
                <Bar dataKey="totalHours" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Organization Hierarchy Preview">
        {hierarchyLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !hierarchy || hierarchy.departments.length === 0 ? (
          <EmptyState message="No departments yet." />
        ) : (
          <div className="flex h-56 flex-col gap-2 overflow-y-auto text-sm">
            {hierarchy.departments.map((d) => (
              <div key={d.id}>
                <p className="font-semibold text-brand-navy">
                  {d.name} <span className="font-normal text-brand-muted">({d.staffCount})</span>
                </p>
                {d.teams.length > 0 ? (
                  <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-[#c3c6d2]/50 pl-3">
                    {d.teams.map((t) => (
                      <li key={t.id} className="text-xs text-brand-muted">
                        {t.name}
                        {t.supervisor ? ` — ${t.supervisor.firstName} ${t.supervisor.lastName}` : ""} ({t.memberCount})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
