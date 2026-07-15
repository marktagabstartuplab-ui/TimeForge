"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Download,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Info,
  CalendarDays,
  Eye,
} from "lucide-react";
import { MetricCard } from "@/components/shared/MetricCard";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDepartments } from "@/features/schedules/api/departments-picker.service";
import {
  listHRTimesheets,
  getHRTimesheetStats,
  exportHRTimesheetsCsv,
  type HRTimesheetRow,
  type HRTimesheetQuery,
} from "../api/hr-timesheets.service";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVISION_REQUESTED", label: "Revision Requested" },
  { value: "PAYROLL_READY", label: "Payroll Ready" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getWeekRange(weeks: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - weeks * 7);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function HRTimesheetsContent() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("ALL");
  const [weekFilter, setWeekFilter] = useState("1");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);
  const pageSize = 10;

  const [selectedDetail, setSelectedDetail] = useState<HRTimesheetRow | null>(null);
  const [selectedRemark, setSelectedRemark] = useState<HRTimesheetRow | null>(null);

  const effectiveFrom = from || (weekFilter !== "custom" ? getWeekRange(Number(weekFilter)).from : "");
  const effectiveTo = to || (weekFilter !== "custom" ? getWeekRange(Number(weekFilter)).to : "");

  const query: HRTimesheetQuery = {
    search: search || undefined,
    departmentId: departmentId || undefined,
    status: status === "ALL" ? undefined : status,
    from: effectiveFrom || undefined,
    to: effectiveTo || undefined,
    cursor,
    limit: pageSize,
  };

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["hr-timesheets", query],
    queryFn: () => listHRTimesheets(query),
  });

  const statsQuery: { departmentId?: string; from?: string; to?: string } = {};
  if (departmentId) statsQuery.departmentId = departmentId;
  if (effectiveFrom) statsQuery.from = effectiveFrom;
  if (effectiveTo) statsQuery.to = effectiveTo;

  const { data: stats } = useQuery({
    queryKey: ["hr-timesheets-stats", statsQuery],
    queryFn: () => getHRTimesheetStats(statsQuery),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["hr-timesheets", "departments"],
    queryFn: listDepartments,
  });

  const rows = data?.data ?? [];
  const pageInfo = data?.page;
  const currentPage = history.length + 1;
  const totalEntries = stats?.totalTimesheets ?? 0;
  const startEntry = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, totalEntries);
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

  const resetPagination = useCallback(() => {
    setCursor(undefined);
    setHistory([]);
  }, []);

  const handleNextPage = useCallback(() => {
    if (pageInfo?.nextCursor) {
      setHistory((prev) => [...prev, cursor ?? ""]);
      setCursor(pageInfo.nextCursor);
    }
  }, [pageInfo?.nextCursor, cursor]);

  const handlePrevPage = useCallback(() => {
    const prev = [...history];
    const prevCursor = prev.pop();
    setHistory(prev);
    setCursor(prevCursor || undefined);
    if (!prevCursor) setCursor(undefined);
  }, [history]);

  const handleExportCsv = useCallback(async () => {
    try {
      await exportHRTimesheetsCsv(query);
      setToast({ message: "Timesheets exported as CSV.", tone: "success" });
    } catch {
      setToast({ message: "Export failed. Please try again.", tone: "error" });
    }
  }, [query]);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Status: Read-only badge */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c3c6d2]/50 bg-white px-3 py-1 text-xs font-semibold text-brand-muted">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Status: Read-only
        </span>
      </div>

      {/* Weekly Overview heading + action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Weekly Overview</h1>
          <p className="text-sm text-brand-muted">Review enterprise workforce time allocations and supervisor notes.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setWeekFilter("1"); setFrom(""); setTo(""); resetPagination(); }}
          >
            <CalendarDays className="h-4 w-4" />
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={isFetching}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Panel (hidden by default, toggled by Filter button) */}
      {showFilters ? (
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Search Employee</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
                <Input
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); resetPagination(); }}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Department</label>
              <Select
                value={departmentId || "ALL"}
                onValueChange={(v) => { setDepartmentId(v === "ALL" ? "" : v ?? ""); resetPagination(); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Departments">{departmentId ? departments.find((d) => d.id === departmentId)?.name : "All Departments"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Status</label>
              <Select
                value={status}
                onValueChange={(v) => { setStatus(v ?? ""); resetPagination(); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses">{STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "All Statuses"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Date Range</label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setWeekFilter("custom"); resetPagination(); }}
                  className="flex-1"
                />
                <span className="text-xs text-brand-muted">to</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setWeekFilter("custom"); resetPagination(); }}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Summary Cards — no icons, colored values per design */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Employees"
          value={stats ? String(stats.totalEmployees) : "—"}
        />
        <MetricCard
          label="Hours Logged"
          value={stats ? stats.hoursLogged.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}
        />
        <MetricCard
          label="Pending Approval"
          value={stats ? String(stats.pendingApproval) : "—"}
          valueClassName="text-brand"
        />
        <MetricCard
          label="Remarks Flagged"
          value={stats ? String(stats.flaggedRemarks) : "—"}
          valueClassName="text-red-600"
        />
      </div>

      {/* Timesheets Table */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-6">
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorState message="Couldn't load timesheets." onRetry={() => { resetPagination(); refetch(); }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState message="No timesheets match the current filters." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                    <th className="py-3 px-5">Employee</th>
                    <th className="py-3 px-5">Date</th>
                    <th className="py-3 px-5">Total Hours</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5">Remarks</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c3c6d2]/30">
                  {rows.map((r) => {
                    const initials = r.employee
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const { label, tone } = timesheetStatusTone(r.status);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4e2e3] text-xs font-bold text-brand-navy">
                              {initials}
                            </span>
                            <span className="font-semibold text-brand-navy">{r.employee}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 text-brand-ink whitespace-nowrap">
                          {formatDate(r.periodEnd)}
                        </td>
                        <td className="py-3.5 px-5 text-brand-ink">
                          {r.totalHours.toFixed(2)} h
                        </td>
                        <td className="py-3.5 px-5">
                          <StatusBadge label={label} tone={tone} />
                        </td>
                        <td className="py-3.5 px-5">
                          {r.supervisorRemark ? (
                            <span className="text-sm text-brand-ink truncate max-w-[200px] inline-block">
                              {r.supervisorRemark}
                            </span>
                          ) : (
                            <span className="text-sm text-brand-muted/60">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => r.supervisorRemark ? setSelectedRemark(r) : setSelectedDetail(r)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-navy transition-colors"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>View<br />Supervisor<br />Remarks</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — "Showing X to Y of Z entries" with page buttons */}
            <div className="flex items-center justify-between border-t border-[#c3c6d2]/40 px-5 py-3">
              <span className="text-sm text-brand-muted">
                Showing {startEntry} to {endEntry} of {totalEntries.toLocaleString()} entries
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!cursor}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[#c3c6d2]/50 text-brand-muted hover:bg-[#f5f6fa] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {/* Page number indicators */}
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                  const page = Math.max(1, currentPage - 1) + i;
                  if (page > totalPages) return null;
                  return (
                    <span
                      key={page}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${
                        page === currentPage
                          ? "bg-brand text-white"
                          : "border border-[#c3c6d2]/50 text-brand-muted hover:bg-[#f5f6fa]"
                      }`}
                    >
                      {page}
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!pageInfo?.hasMore}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[#c3c6d2]/50 text-brand-muted hover:bg-[#f5f6fa] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Data Refresh Note */}
      <div className="flex items-start gap-3 rounded-[16px] border border-[#c3c6d2]/50 bg-[#f8f9fb] px-5 py-4">
        <Info className="h-5 w-5 shrink-0 text-brand mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-brand-navy">Data Refresh Note</p>
          <p className="text-sm text-brand-muted">
            This timesheet view is updated every 30 minutes. As a Read-only user, you cannot modify entries, but you can view detailed audit trails and supervisor communication logs.
          </p>
        </div>
      </div>

      {/* Timesheet Detail Modal */}
      {selectedDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedDetail(null)}>
          <div className="w-full max-w-lg rounded-[16px] bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-brand-navy">Timesheet Details</h3>
              <button type="button" onClick={() => setSelectedDetail(null)} className="text-brand-muted hover:text-brand-navy text-xl leading-none">&times;</button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4e2e3] text-sm font-bold text-brand-navy">
                {selectedDetail.employee.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="font-semibold text-brand-navy">{selectedDetail.employee}</p>
                <p className="text-xs text-brand-muted">{selectedDetail.department ?? "Unassigned"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Period</p>
                <p className="text-brand-ink">{formatDate(selectedDetail.periodStart)} – {formatDate(selectedDetail.periodEnd)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Total Hours</p>
                <p className="font-semibold text-brand-ink">{selectedDetail.totalHours.toFixed(2)} h</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Status</p>
                <StatusBadge label={timesheetStatusTone(selectedDetail.status).label} tone={timesheetStatusTone(selectedDetail.status).tone} />
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Time Entries</p>
                <p className="text-brand-ink">{selectedDetail.entriesCount}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Submitted</p>
                <p className="text-brand-ink">{selectedDetail.submittedAt ? formatDate(selectedDetail.submittedAt) : "Not submitted"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Decided</p>
                <p className="text-brand-ink">{selectedDetail.decidedAt ? formatDate(selectedDetail.decidedAt) : "Pending"}</p>
              </div>
            </div>
            {selectedDetail.supervisorName ? (
              <div className="mt-4 rounded-[12px] bg-[#f6f3f4] p-3">
                <p className="text-xs font-semibold text-brand-muted uppercase mb-1">Supervisor</p>
                <p className="text-sm text-brand-ink">{selectedDetail.supervisorName}</p>
                {selectedDetail.supervisorRemark ? (
                  <p className="mt-1 text-sm text-brand-muted italic">&ldquo;{selectedDetail.supervisorRemark}&rdquo;</p>
                ) : null}
              </div>
            ) : null}
            {selectedDetail.summary ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-brand-muted uppercase mb-1">Employee Notes</p>
                <p className="text-sm text-brand-ink bg-[#f6f3f4] rounded-[12px] p-3">{selectedDetail.summary}</p>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedDetail(null)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Supervisor Remark Modal */}
      {selectedRemark ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedRemark(null)}>
          <div className="w-full max-w-md rounded-[16px] bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-brand" />
                <h3 className="text-lg font-bold text-brand-navy">Supervisor Remarks</h3>
              </div>
              <button type="button" onClick={() => setSelectedRemark(null)} className="text-brand-muted hover:text-brand-navy text-xl leading-none">&times;</button>
            </div>
            <div className="mb-3">
              <p className="text-sm font-semibold text-brand-navy">{selectedRemark.employee}</p>
              <p className="text-xs text-brand-muted">{formatDate(selectedRemark.periodEnd)}</p>
            </div>
            <div className="rounded-[12px] border border-[#c3c6d2]/40 bg-[#f6f3f4] p-4">
              <p className="text-sm text-brand-ink">{selectedRemark.supervisorRemark}</p>
            </div>
            {selectedRemark.supervisorName ? (
              <p className="mt-3 text-xs text-brand-muted">
                — {selectedRemark.supervisorName}{selectedRemark.actedAt ? `, ${formatDate(selectedRemark.actedAt)}` : ""}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedRemark(null)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
