"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAuditLogs, type AuditAction } from "../api/audit-logs.service";

const ACTIONS: (AuditAction | "ALL")[] = [
  "ALL",
  "LOGIN",
  "LOGOUT",
  "APPROVE",
  "REJECT",
  "REVISION_REQUEST",
  "PAYROLL_EXPORT",
  "ROLE_CHANGE",
  "PASSWORD_CHANGE",
  "AI_USAGE",
  "SETTINGS_CHANGE",
  "ADMIN_ACTION",
];

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AuditLogsContent() {
  const [action, setAction] = useState<AuditAction | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin", "audit-logs", { action, search }],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      listAuditLogs({
        action: action === "ALL" ? undefined : action,
        q: search || undefined,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
  });

  const rows = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-navy">
          <ScrollText className="h-6 w-6" aria-hidden="true" />
          Audit Logs
        </h1>
        <p className="text-sm text-brand-muted">Full system audit trail for this organization.</p>
      </div>

      <SectionCard title="Filters">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput
            placeholder="Search by entity type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={action} onValueChange={(v) => setAction(v as AuditAction | "ALL")}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a === "ALL" ? "All Actions" : actionLabel(a)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Events">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load audit logs." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState message="No audit log entries match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#c3c6d2]/50 text-xs uppercase tracking-wide text-brand-muted">
                  <th className="pb-2 pr-4 font-semibold">Timestamp</th>
                  <th className="pb-2 pr-4 font-semibold">Action</th>
                  <th className="pb-2 pr-4 font-semibold">Entity</th>
                  <th className="pb-2 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-brand-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="py-2.5 pr-4 font-medium text-brand-ink">{actionLabel(row.action)}</td>
                    <td className="py-2.5 pr-4 text-brand-muted">{row.entityType ?? "—"}</td>
                    <td className="py-2.5 text-brand-muted">{row.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="self-center"
          >
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </Button>
        ) : null}
      </SectionCard>
    </div>
  );
}
