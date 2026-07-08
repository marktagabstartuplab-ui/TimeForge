"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionCard } from "@/components/shared/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminActivity, getAdminCharts } from "../api/admin-dashboard.service";

const AXIS_STYLE = { fontSize: 11, fill: "var(--brand-muted)" };
const GRID_STROKE = "#c3c6d2";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShortMonth(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export function ChartsSection() {
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["admin", "dashboard", "activity"],
    queryFn: () => getAdminActivity(14),
  });
  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ["admin", "dashboard", "charts"],
    queryFn: getAdminCharts,
  });

  const orgStatsData = charts
    ? [
        { name: "Departments", value: charts.organizationStats.departments },
        { name: "Teams", value: charts.organizationStats.teams },
        { name: "Projects", value: charts.organizationStats.projects },
        { name: "Clients", value: charts.organizationStats.clients },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SectionCard title="Daily Activity" className="lg:col-span-2">
        {activityLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activity?.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip labelFormatter={(v) => formatShortDate(String(v))} formatter={(v) => [String(v), "Events"]} />
                <Line type="monotone" dataKey="count" stroke="var(--brand)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Organization Statistics">
        {chartsLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orgStatsData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Bar dataKey="value" fill="var(--brand-cyan)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Employee Growth" className="lg:col-span-3">
        {chartsLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts?.employeeGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="month" tickFormatter={formatShortMonth} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip labelFormatter={(v) => formatShortMonth(String(v))} formatter={(v) => [String(v), "New employees"]} />
                <Line type="monotone" dataKey="newUsers" stroke="var(--brand-navy)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
