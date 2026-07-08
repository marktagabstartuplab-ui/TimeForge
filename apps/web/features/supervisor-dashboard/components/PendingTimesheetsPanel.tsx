"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { bulkApproveTimesheets, getPendingTimesheets } from "../api/supervisor-dashboard.service";
import type { PendingTimesheetRow } from "../api/supervisor-dashboard.service";
import { TimesheetReviewModal } from "./TimesheetReviewModal";
import type { ToastState } from "@/components/shared/Toast";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PendingTimesheetsPanel({ onToast }: { onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewRow, setReviewRow] = useState<PendingTimesheetRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["supervisor", "pending-timesheets"],
    queryFn: () => getPendingTimesheets({ limit: 20 }),
    refetchInterval: 60_000,
  });
  const rows = data?.data ?? [];

  const bulkApprove = useMutation({
    mutationFn: () =>
      bulkApproveTimesheets(
        rows
          .filter((r) => selected.has(r.id))
          .map((r) => ({ timesheetId: r.id, expectedVersion: r.version })),
      ),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => r.status === "error");
      onToast(
        failed.length > 0
          ? { message: `Approved ${res.results.length - failed.length}, ${failed.length} failed.`, tone: "error" }
          : { message: `Approved ${res.results.length} timesheet${res.results.length === 1 ? "" : "s"}.`, tone: "success" },
      );
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["supervisor"] });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Bulk approve failed.", tone: "error" }),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  return (
    <SectionCard
      title="Review Pending Timesheets"
      action={
        selected.size > 0 ? (
          <Button
            onClick={() => bulkApprove.mutate()}
            disabled={bulkApprove.isPending}
            className="flex items-center gap-2 bg-brand text-white hover:bg-[#1467d6]"
          >
            {bulkApprove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
            Bulk Approve ({selected.size})
          </Button>
        ) : null
      }
    >
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No timesheets awaiting your review." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="w-10 pb-2">
                  <Checkbox
                    checked={selected.size === rows.length && rows.length > 0}
                    onCheckedChange={toggleAll}
                    aria-label="Select all pending timesheets"
                  />
                </th>
                <th className="pb-2 pr-4">Employee</th>
                <th className="pb-2 pr-4">Period</th>
                <th className="pb-2 pr-4">Total Hours</th>
                <th className="pb-2 pr-4">KPI Score</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {rows.map((r) => {
                const { label, tone } = timesheetStatusTone(r.status);
                return (
                  <tr key={r.id}>
                    <td className="py-2.5">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.employeeName}`} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-brand-ink">{r.employeeName}</div>
                      <div className="text-xs text-brand-muted">{r.department ?? "—"}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-muted">
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-brand-ink">{r.totalHours}h</td>
                    <td className="py-2.5 pr-4 text-brand-ink">{r.kpiScore !== null ? `${r.kpiScore}%` : "—"}</td>
                    <td className="py-2.5 pr-4"><StatusBadge label={label} tone={tone} /></td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => setReviewRow(r)}
                        className="rounded-[8px] px-3 py-1.5 text-xs font-bold text-brand hover:bg-brand-cyan/10"
                      >
                        Open Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TimesheetReviewModal row={reviewRow} onOpenChange={(open) => !open && setReviewRow(null)} onToast={onToast} />
    </SectionCard>
  );
}
