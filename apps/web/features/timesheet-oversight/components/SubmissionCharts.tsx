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
import { getTimesheetChart } from "../api/timesheet-oversight.service";

const AXIS_STYLE = { fontSize: 11, fill: "var(--brand-muted)" };
const GRID_STROKE = "#c3c6d2";

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export function SubmissionCharts() {
  const { data, isLoading } = useQuery({
    queryKey: ["timesheet-oversight", "chart"],
    queryFn: () => getTimesheetChart({ weeks: 4, months: 6 }),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Weekly Submissions">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.weeklySubmissions ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip formatter={(v) => [String(v), "Submissions"]} />
                <Bar dataKey="count" fill="var(--brand-cyan)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Monthly Trend">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthlyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={30} />
                <Tooltip labelFormatter={(v) => formatMonth(String(v))} formatter={(v) => [String(v), "Submissions"]} />
                <Line type="monotone" dataKey="count" stroke="var(--brand-navy)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
