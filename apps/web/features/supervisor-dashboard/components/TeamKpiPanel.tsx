"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { getTeamKpis } from "../api/supervisor-dashboard.service";

export function TeamKpiPanel() {
  const [filter, setFilter] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["supervisor", "team-kpis", filter],
    queryFn: () => getTeamKpis(filter),
    refetchInterval: 60_000,
  });
  const rows = data ?? [];
  const options = Array.from(new Map(rows.map((r) => [r.kpiTemplateId, r.name])).entries());

  return (
    <SectionCard
      title="Team KPI Performance"
      action={
        options.length > 0 ? (
          <select
            value={filter ?? ""}
            onChange={(e) => setFilter(e.target.value || undefined)}
            aria-label="Filter by KPI"
            className="h-9 rounded-[8px] border border-[#c3c6d2]/60 bg-white px-3 text-sm text-brand-ink"
          >
            <option value="">All KPIs</option>
            {options.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        ) : null
      }
    >
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No KPI progress recorded for your team yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((kpi) => (
            <div key={kpi.kpiTemplateId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-brand-ink">{kpi.name}</span>
                  {kpi.belowTarget ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
                      <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                      Below Target
                    </span>
                  ) : null}
                </div>
                <span className="text-sm font-bold text-brand-ink">{kpi.percentage}%</span>
              </div>
              <ProgressBar
                percent={kpi.percentage}
                barClassName={kpi.belowTarget ? "bg-amber-500" : undefined}
                label={kpi.name}
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
