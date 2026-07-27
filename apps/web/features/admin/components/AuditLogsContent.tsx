"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ScrollText, User, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAuditLogs, type AuditAction, type AuditLogEntry } from "../api/audit-logs.service";

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
  "PAYROLL_VALIDATED",
  "PAYROLL_APPROVED",
  "PAYROLL_REJECTED",
  "PAYROLL_SENT_TO_BANK",
  "TIME_ADJUSTMENT",
];

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function actionColor(action: string): string {
  if (action === "LOGIN") return "bg-[#dbeafe] text-[#1d4ed8]";
  if (action === "LOGOUT") return "bg-[#f1f5f9] text-[#475569]";
  if (action === "APPROVE" || action === "PAYROLL_APPROVED" || action === "PAYROLL_SENT_TO_BANK") return "bg-[#dcfce7] text-[#15803d]";
  if (action === "REJECT" || action === "PAYROLL_REJECTED") return "bg-[#fee2e2] text-[#dc2626]";
  if (action === "REVISION_REQUEST") return "bg-[#fef3c7] text-[#b45309]";
  if (action === "PAYROLL_EXPORT" || action === "PAYROLL_VALIDATED") return "bg-[#ede9fe] text-[#7c3aed]";
  if (action === "ROLE_CHANGE" || action === "ADMIN_ACTION") return "bg-[#ffedd5] text-[#c2410c]";
  // Someone's hours were changed by someone else — worth standing out.
  if (action === "TIME_ADJUSTMENT") return "bg-[#fef3c7] text-[#92400e]";
  return "bg-[#f1f5f9] text-[#334155]";
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

function metadataSummary(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const parts: string[] = [];
  if (m["total"] !== undefined) parts.push(`${m["total"]} items`);
  if (m["ok"] !== undefined) parts.push(`${m["ok"]} ok`);
  if (m["errors"] !== undefined && Number(m["errors"]) > 0) parts.push(`${m["errors"]} errors`);
  if (m["action"]) parts.push(String(m["action"]));
  if (m["format"]) parts.push(`format: ${String(m["format"])}`);
  if (m["reason"]) parts.push(`reason: ${String(m["reason"])}`);
  if (m["role"]) parts.push(`role: ${String(m["role"])}`);
  if (m["from"] && m["to"]) parts.push(`${String(m["from"])} → ${String(m["to"])}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function AuditRow({ row }: { row: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const actorName = row.actor
    ? `${row.actor.firstName} ${row.actor.lastName}`
    : "System";
  const actorEmail = row.actor?.email ?? null;
  const summary = metadataSummary(row.metadata);

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer transition-colors hover:bg-[#f8fafc]",
          expanded && "bg-[#f8fafc]"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Timestamp */}
        <td className="py-3 pr-4 whitespace-nowrap text-brand-muted text-sm">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-brand-muted/60" />
            {formatDateTime(row.createdAt)}
          </div>
        </td>

        {/* Actor */}
        <td className="py-3 pr-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold shrink-0">
              {row.actor ? row.actor.firstName.slice(0, 1).toUpperCase() : "S"}
            </div>
            <div>
              <div className="font-medium text-brand-ink leading-tight">{actorName}</div>
              {actorEmail && (
                <div className="text-xs text-brand-muted leading-tight">{actorEmail}</div>
              )}
            </div>
          </div>
        </td>

        {/* Action */}
        <td className="py-3 pr-4">
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", actionColor(row.action))}>
            {actionLabel(row.action)}
          </span>
        </td>

        {/* Entity / Changed */}
        <td className="py-3 pr-4 text-sm text-brand-muted">
          <div className="font-medium text-brand-ink">{row.entityType ?? "—"}</div>
          {summary && <div className="text-xs text-brand-muted mt-0.5 truncate max-w-[200px]">{summary}</div>}
        </td>

        {/* IP */}
        <td className="py-3 pr-4 font-mono text-xs text-brand-navy">{row.ip ?? "—"}</td>

        {/* Expand toggle */}
        <td className="py-3 text-right">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-brand-muted ml-auto" />
            : <ChevronRight className="h-4 w-4 text-brand-muted ml-auto" />}
        </td>
      </tr>

      {/* Expanded metadata row */}
      {expanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={6} className="pb-3 pt-0 px-4">
            <div className="rounded-lg border border-[#c3c6d2]/30 bg-white p-3 text-xs text-brand-muted font-mono overflow-x-auto">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-brand-muted/70">Raw Metadata</div>
              {row.metadata
                ? JSON.stringify(row.metadata, null, 2)
                : <span className="italic">No metadata recorded</span>}
            </div>
            {row.entityId && (
              <div className="mt-1.5 text-[10px] text-brand-muted">
                Entity ID: <span className="font-mono">{row.entityId}</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
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
        <p className="text-sm text-brand-muted">
          Full system audit trail — who made a change, what changed, and when.
        </p>
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
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
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
                  <th className="pb-2 pr-4 font-semibold">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      Actor
                    </span>
                  </th>
                  <th className="pb-2 pr-4 font-semibold">Action</th>
                  <th className="pb-2 pr-4 font-semibold">Changed</th>
                  <th className="pb-2 pr-4 font-semibold">IP</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((row) => (
                  <AuditRow key={row.id} row={row} />
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
