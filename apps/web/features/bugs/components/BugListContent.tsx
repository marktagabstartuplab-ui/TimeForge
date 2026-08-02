"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, CircleDot, Loader2, AlertTriangle, UserX } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { SearchInput } from "@/components/shared/SearchInput";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/features/auth/rbac";
import { BUG_PRIORITIES, BUG_STATUSES } from "../schemas/bug.schema";
import { getBugStats, listBugs, type BugPriority, type BugStatus } from "../api/bugs.service";
import { BugCard } from "./BugCard";

const ALL = "ALL";

export function BugListContent() {
  const canReadOrg = useCan("bug:read_org");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [priority, setPriority] = useState<string>(ALL);

  const query = {
    ...(status !== ALL ? { status: status as BugStatus } : {}),
    ...(priority !== ALL ? { priority: priority as BugPriority } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["bugs", "list", query],
    queryFn: () => listBugs(query),
  });

  const { data: stats } = useQuery({
    queryKey: ["bugs", "stats"],
    queryFn: getBugStats,
  });

  const rows = data?.data ?? [];
  const filtersActive = status !== ALL || priority !== ALL || search !== "";

  const header = (
    <PageHeader
      title={canReadOrg ? "Submitted Issues" : "My Bug Reports"}
      subtitle={
        canReadOrg
          ? "Every bug reported across the organization."
          : "Bugs you have reported or that are assigned to you."
      }
      action={
        <Link
          href="/bugs/create"
          className="inline-flex items-center gap-2 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1467d6]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Report a Bug
        </Link>
      }
    />
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load bug reports."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      {stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={CircleDot} label="Open" value={String(stats.open)} />
          <StatCard icon={Loader2} label="In Progress" value={String(stats.inProgress)} />
          <StatCard icon={AlertTriangle} label="Critical" value={String(stats.critical)} />
          <StatCard icon={UserX} label="Unassigned" value={String(stats.unassigned)} />
        </div>
      ) : null}

      <SectionCard title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search bugs"
            placeholder="Search title, description or page…"
            className="h-11"
          />
          <Select value={status} onValueChange={(v) => setStatus(v ?? ALL)}>
            <SelectTrigger
              aria-label="Filter by status"
              className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {BUG_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => setPriority(v ?? ALL)}>
            <SelectTrigger
              aria-label="Filter by priority"
              className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
            >
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {BUG_PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-[12px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          variant="empty"
          message={filtersActive ? "No bugs match these filters." : "No bugs reported yet."}
          action={
            filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus(ALL);
                  setPriority(ALL);
                }}
                className="mt-2 rounded-[8px] bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-[#1467d6]"
              >
                Clear Filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((bug) => (
            <BugCard key={bug.id} bug={bug} />
          ))}
        </div>
      )}
    </div>
  );
}
