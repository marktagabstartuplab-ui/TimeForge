"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fetchDepartments } from "@/features/auth/api/auth.service";
import { ApiError } from "@/lib/api/client";
import {
  bulkApproveTimesheets,
  bulkRejectTimesheets,
  exportTimesheetsCsv,
  listOversightTimesheets,
  type TimesheetOversightQuery,
} from "../api/timesheet-oversight.service";
import type { ToastState } from "@/components/shared/Toast";

const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "REVISION_REQUESTED", "PAYROLL_READY"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function OversightTable({ onToast }: { onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("ALL");
  const [departmentId, setDepartmentId] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectRemark, setRejectRemark] = useState("");

  const { data: departments } = useQuery({ queryKey: ["auth", "departments"], queryFn: fetchDepartments });

  const query: Omit<TimesheetOversightQuery, "cursor"> = {
    status: status === "ALL" ? undefined : status,
    departmentId: departmentId === "ALL" ? undefined : departmentId,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    sortBy: "periodStart",
    sortDir: "desc",
    limit: 10,
  };

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["timesheet-oversight", "list", query],
    queryFn: ({ pageParam }: { pageParam?: string }) => listOversightTimesheets({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
  });

  const rows = data?.pages.flatMap((p) => p.data) ?? [];
  const actionable = rows.filter((r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["timesheet-oversight"] });
    setSelected(new Set());
  };

  const approve = useMutation({
    mutationFn: () =>
      bulkApproveTimesheets(
        rows.filter((r) => selected.has(r.id)).map((r) => ({ timesheetId: r.id, expectedVersion: r.version })),
      ),
    onSuccess: (res) => {
      const errors = res.results.filter((r) => r.status === "error");
      onToast(
        errors.length > 0
          ? { message: `Approved ${res.results.length - errors.length}, ${errors.length} failed.`, tone: "error" }
          : { message: `Approved ${res.results.length} timesheet(s).`, tone: "success" },
      );
      invalidateAll();
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Bulk approve failed.", tone: "error" }),
  });

  const reject = useMutation({
    mutationFn: () =>
      bulkRejectTimesheets(
        rows.filter((r) => selected.has(r.id)).map((r) => ({ timesheetId: r.id, expectedVersion: r.version })),
        rejectRemark,
      ),
    onSuccess: (res) => {
      const errors = res.results.filter((r) => r.status === "error");
      onToast(
        errors.length > 0
          ? { message: `Rejected ${res.results.length - errors.length}, ${errors.length} failed.`, tone: "error" }
          : { message: `Rejected ${res.results.length} timesheet(s).`, tone: "success" },
      );
      setRejectOpen(false);
      setRejectRemark("");
      invalidateAll();
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Bulk reject failed.", tone: "error" }),
  });

  const toggleSelectAll = () => {
    if (selected.size === actionable.length && actionable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actionable.map((r) => r.id)));
    }
  };

  return (
    <>
      <SectionCard title="Timesheets">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Department</label>
            <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "ALL")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "ALL")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#c3c6d2] px-2.5 text-sm text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#c3c6d2] px-2.5 text-sm text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </div>
          <div className="flex-[1.4] min-w-[200px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Employee</label>
            <SearchInput placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={() => exportTimesheetsCsv(rows)} disabled={rows.length === 0}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        </div>

        {selected.size > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-[10px] bg-brand-cyan/10 px-4 py-2.5">
            <p className="text-sm font-semibold text-brand-navy">{selected.size} selected</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={reject.isPending}>
                Reject
              </Button>
              <Button type="button" size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
                {approve.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Approve
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load timesheets." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState message="No timesheets match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  <th className="w-8 pb-2">
                    <Checkbox
                      checked={actionable.length > 0 && selected.size === actionable.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="pb-2 pr-4">Employee</th>
                  <th className="pb-2 pr-4">Department</th>
                  <th className="pb-2 pr-4">Pay Period</th>
                  <th className="pb-2 pr-4">Total Hours</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((r) => {
                  const { label, tone } = timesheetStatusTone(r.status);
                  const canAct = r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5">
                        {canAct ? (
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={(checked) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              });
                            }}
                          />
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Avatar firstName={r.user.firstName} lastName={r.user.lastName} size="sm" />
                          <span className="font-medium text-brand-ink">{r.user.firstName} {r.user.lastName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-brand-muted">{r.user.department?.name ?? "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-brand-muted">
                        {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                      </td>
                      <td className="py-2.5 pr-4 text-brand-ink">{formatHours(r.totalMinutes)}</td>
                      <td className="py-2.5"><StatusBadge label={label} tone={tone} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasNextPage ? (
          <Button type="button" variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="self-center">
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </Button>
        ) : null}
      </SectionCard>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <DialogTitle>Reject {selected.size} Timesheet{selected.size === 1 ? "" : "s"}</DialogTitle>
              <DialogDescription>A reason is required and will be sent to each employee.</DialogDescription>
            </div>
            <DialogCloseButton />
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">
            <Textarea
              value={rejectRemark}
              onChange={(e) => setRejectRemark(e.target.value)}
              placeholder="Reason for rejection..."
              rows={4}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button
                type="button"
                onClick={() => reject.mutate()}
                disabled={reject.isPending || !rejectRemark.trim()}
              >
                {reject.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
