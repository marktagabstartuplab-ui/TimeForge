"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getScrumHeatmap } from "../api/scrum-management.service";

function cellTone(value: number): string {
  if (value >= 95) return "bg-brand text-white";
  if (value >= 80) return "bg-brand/70 text-white";
  if (value >= 60) return "bg-brand/40 text-brand-navy";
  if (value > 0) return "bg-brand/15 text-brand-navy";
  return "bg-[#f0f0f0] text-brand-muted";
}

export function DepartmentHeatmap() {
  const [week, setWeek] = useState<"current" | "previous">("current");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["scrum-mgmt", "heatmap", week],
    queryFn: () => getScrumHeatmap(week),
  });

  return (
    <SectionCard
      title="Participation Heatmap"
      action={
        <Select value={week} onValueChange={(v) => setWeek(v as "current" | "previous")}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current Week</SelectItem>
            <SelectItem value="previous">Previous Week</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <ErrorState message="Couldn't load the heatmap." onRetry={() => refetch()} />
      ) : data && data.departments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold text-brand-muted">
                <th className="pb-2 pr-4">Department</th>
                {data.days.map((d) => (
                  <th key={d} className="px-1 pb-2 text-center">{d}</th>
                ))}
                <th className="pb-2 pl-4 text-right">Avg %</th>
              </tr>
            </thead>
            <tbody>
              {data.departments.map((dept) => (
                <tr key={dept.departmentId}>
                  <td className="whitespace-nowrap py-1.5 pr-4 font-medium text-brand-navy">{dept.name}</td>
                  {dept.values.map((v, i) => (
                    <td key={i} className="px-1 py-1.5 text-center">
                      <span className={`inline-flex h-8 w-11 items-center justify-center rounded-[6px] text-xs font-bold ${cellTone(v)}`}>
                        {v}
                      </span>
                    </td>
                  ))}
                  <td className="py-1.5 pl-4 text-right font-bold text-brand">{dept.avg}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No department data for this week yet." />
      )}
    </SectionCard>
  );
}
