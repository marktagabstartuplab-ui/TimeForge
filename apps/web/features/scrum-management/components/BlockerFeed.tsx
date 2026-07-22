"use client";

import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { getScrumBlockers } from "../api/scrum-management.service";

const SEVERITY_TONE: Record<string, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function BlockerFeed({ onViewAll }: { onViewAll?: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["scrum-mgmt", "blockers"],
    queryFn: () => getScrumBlockers({ status: "OPEN" }),
  });

  const highImpactCount = data?.data.filter((b) => b.severity === "HIGH" || b.severity === "CRITICAL").length ?? 0;

  return (
    <SectionCard
      title="Global Blocker Feed"
      action={highImpactCount > 0 ? <StatusBadge label="High Impact" tone="danger" /> : null}
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : isError ? (
        <ErrorState message="Couldn't load blockers." onRetry={() => refetch()} />
      ) : data && data.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.data.slice(0, 5).map((b) => (
            <li
              key={b.id}
              className="rounded-[10px] border-l-4 bg-[#f6f3f4] p-3"
              style={{ borderLeftColor: b.severity === "CRITICAL" || b.severity === "HIGH" ? "#dc2626" : "#c3c6d2" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-brand-navy">{b.title}</p>
                <StatusBadge label={b.severity} tone={SEVERITY_TONE[b.severity]} />
              </div>
              {b.description ? <p className="mt-1 text-sm text-brand-muted">{b.description}</p> : null}
              <p className="mt-1.5 text-xs text-brand-muted">
                {b.employeeName} {b.team ? `· ${b.team}` : b.department ? `· ${b.department}` : ""} · {formatDate(b.entryDate)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message="No open blockers — everything's clear." />
      )}

      {data && data.data.length > 0 ? (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-semibold text-brand hover:text-brand/80 hover:underline focus:outline-none"
          >
            View All {data.data.length} Blockers
          </button>
        </div>
      ) : null}
    </SectionCard>
  );
}
