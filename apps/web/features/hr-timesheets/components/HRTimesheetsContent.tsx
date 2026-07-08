"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Clock,
  ClipboardCheck,
  Flag,
  Search,
  Download,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageSquare,
  FileText,
  AlertTriangle,
  Info,
  CalendarDays,
  FileSpreadsheet,
} from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
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
  exportHRTimesheetsExcel,
  exportHRTimesheetsPdf,
  type HRTimesheetRow,
  type HRTimesheetQuery,
  type TimesheetStatus,
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

const WEEK_OPTIONS = [
  { value: "1", label: "This Week" },
  { value: "2", label: "Last 2 Weeks" },
  { value: "4", label: "Last 4 Weeks" },
  { value: "custom", label: "Custom Range" },
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
  const pageSize = 15;

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

  const handleRefresh = useCallback(() => {
    setCursor(undefined);
    setHistory([]);
    refetch();
  }, [refetch]);

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

  const handleExport = useCallback(async (format: "csv" | "excel" | "pdf") => {
    try {
      if (format === "csv") await exportHRTimesheetsCsv(query);
      else if (format === "excel") await exportHRTimesheetsExcel(query);
      else await exportHRTimesheetsPdf(query);
      setToast({ message: `Timesheets exported as ${format.toUpperCase()}.`, tone: "success" });
    } catch {
      setToast({ message: "Export failed. Please try again.", tone: "error" });
    }
  }, [query]);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-brand-muted">HR &gt; Timesheets</p>
          <h1 className="text-2xl font-bold text-brand-navy">Timesheet Review</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => handleExport("csv")} disabled={isFetching} title="Export CSV">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button size="sm" onClick={() => handleExport("excel")} disabled={isFetching} title="Export Excel">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button size="sm" onClick={() => handleExport("pdf")} disabled={isFetching} title="Export PDF">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          iconTone="bg-brand-cyan/15 text-brand"
          label="Total Employees"
          value={stats ? String(stats.totalEmployees) : "..."}
        />
        <MetricCard
          icon={Clock}
          iconTone="bg-brand-cyan/15 text-brand"
          label="Hours Logged"
          value={stats ? String(stats.hoursLogged) : "..."}
          valueSuffix="hrs"
        />
        <MetricCard
          icon={ClipboardCheck}
          iconTone="bg-amber-50 text-amber-600"
          label="Pending Approval"
          value={stats ? String(stats.pendingApproval) : "..."}
        />
        <MetricCard
          icon={Flag}
          iconTone={stats && stats.flaggedRemarks > 0 ? "bg-red-50 text-red-600" : "bg-brand-cyan/15 text-brand"}
          label="Flagged Remarks"
          value={stats ? String(stats.flaggedRemarks) : "..."}
        />
      </div>

      {/* Filters */}
      <SectionCard title="">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 -mt-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Employee Name</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
              <Input
                placeholder="Search employee..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCursor(undefined); setHistory([]); }}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Department</label>
            <Select
              value={departmentId || "ALL"}
              onValueChange={(v) => { setDepartmentId(v === "ALL" ? "" : v ?? ""); setCursor(undefined); setHistory([]); }}
            >
              <SelectTrigger>
                <SelectValue />
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
              onValueChange={(v) => { setStatus(v ?? ""); setCursor(undefined); setHistory([]); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => setShowFilters((v) => !v)} className="flex-1">
              <SlidersHorizontal className="h-4 w-4" /> {showFilters ? "Hide" : "More"} Filters
            </Button>
          </div>
        </div>

        {showFilters ? (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[#c3c6d2]/40 pt-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Week</label>
              <Select
                value={weekFilter}
                onValueChange={(v) => {
                  setWeekFilter(v ?? "1");
                  if (v && v !== "custom") { setFrom(""); setTo(""); }
                  setCursor(undefined);
                  setHistory([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEK_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">From</label>
              <Input
                type="date"
                value={from}
                disabled={weekFilter !== "custom"}
                onChange={(e) => { setFrom(e.target.value); setCursor(undefined); setHistory([]); }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">To</label>
              <Input
                type="date"
                value={to}
                disabled={weekFilter !== "custom"}
                onChange={(e) => { setTo(e.target.value); setCursor(undefined); setHistory([]); }}
              />
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* Table */}
      <SectionCard title="">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-100" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load timesheets." onRetry={handleRefresh} />
        ) : rows.length === 0 ? (
          <EmptyState message="No timesheets match the current filters." />
        ) : (
          <div className="overflow-x-auto -mt-2">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Total Hours</th>
                  <th className="py-3 px-4">Approval Status</th>
                  <th className="py-3 px-4">Supervisor Remarks</th>
                  <th className="py-3 px-4 text-right">Actions</th>
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
                  const hasRemark = Boolean(r.supervisorRemark);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4e2e3] text-xs font-bold text-brand-navy">
                            {initials}
                          </span>
                          <div>
                            <span className="font-semibold text-brand-navy">{r.employee}</span>
                            {r.department ? (
                              <p className="text-xs text-brand-muted">{r.department}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-brand-ink whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />
                          <span>{formatDate(r.periodEnd)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-brand-ink">
                        {r.totalHours.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge label={label} tone={tone} />
                      </td>
                      <td className="py-3 px-4">
                        {hasRemark ? (
                          <button
                            type="button"
                            onClick={() => setSelectedRemark(r)}
                            className="flex items-center gap-1.5 text-brand-muted hover:text-brand-navy transition-colors"
                            title="View supervisor remark"
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs truncate max-w-[140px]">{r.supervisorRemark}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-brand-muted/60">No remarks</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setSelectedDetail(r)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cursor pagination */}
        {pageInfo && rows.length > 0 ? (
          <div className="mt-4 flex items-center justify-between border-t border-[#c3c6d2]/40 pt-3">
            <span className="text-xs text-brand-muted">
              Page {history.length + 1}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={!cursor}
                className="rounded p-1.5 text-brand hover:bg-[#f5f6fa] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!pageInfo.hasMore}
                className="rounded p-1.5 text-brand hover:bg-[#f5f6fa] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* Information Panel */}
      <SectionCard title="">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between -mt-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-brand" aria-hidden="true" />
            <span className="text-sm font-semibold text-brand-muted">Read-only view</span>
            <span className="hidden sm:inline text-xs text-brand-muted/60">HR timesheet data is displayed for review only. All changes must be made by the employee or their supervisor.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-brand-muted/60 shrink-0">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Last sync: {new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            <span className="flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              Audit trail enabled
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Detail Modal */}
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
                <p className="text-brand-ink">{formatDate(selectedDetail.periodStart)} - {formatDate(selectedDetail.periodEnd)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-muted uppercase">Total Hours</p>
                <p className="font-semibold text-brand-ink">{selectedDetail.totalHours.toFixed(2)}</p>
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
                  <p className="mt-1 text-sm text-brand-muted italic">"{selectedDetail.supervisorRemark}"</p>
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
                — {selectedRemark.supervisorName}, {selectedRemark.actedAt ? formatDate(selectedRemark.actedAt) : ""}
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
