"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  Download,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Bell,
  Loader2,
} from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDepartments } from "@/features/schedules/api/departments-picker.service";
import { listPeriods } from "@/features/payroll-processing/api/payroll-processing.service";
import {
  getAttendanceReport,
  exportAttendanceReport,
  type AttendanceStatus,
  type AttendanceReportQuery,
} from "../api/attendance-reports.service";

const STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  PERFECT: "success",
  EXCELLENT: "info",
  GOOD: "neutral",
  CRITICAL: "danger",
};
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PERFECT: "Perfect",
  EXCELLENT: "Excellent",
  GOOD: "Good",
  CRITICAL: "Critical",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AttendanceReportsContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [payrollPeriodId, setPayrollPeriodId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "ALL">("ALL");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState<AttendanceReportQuery["sortBy"]>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const query: AttendanceReportQuery = {
    search: search || undefined,
    departmentId: departmentId || undefined,
    payrollPeriodId: payrollPeriodId || undefined,
    from: !payrollPeriodId && from ? from : undefined,
    to: !payrollPeriodId && to ? to : undefined,
    status: status === "ALL" ? undefined : status,
    sortBy,
    sortDir,
    page,
    pageSize,
  };

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["attendance-reports", query],
    queryFn: () => getAttendanceReport(query),
  });

  const { data: departments = [] } = useQuery({ queryKey: ["attendance-reports", "departments"], queryFn: listDepartments });
  const { data: periodsPage } = useQuery({ queryKey: ["attendance-reports", "periods"], queryFn: listPeriods });
  const periods = periodsPage?.data ?? [];

  const exportMutation = useMutation({
    mutationFn: (format: "CSV" | "XLSX" | "PDF") => exportAttendanceReport({ ...query, format }),
    onSuccess: () => setToast({ message: "Attendance report exported.", tone: "success" }),
    onError: (err: any) => setToast({ message: err?.message || "Export failed.", tone: "error" }),
  });

  const toggleSort = (key: NonNullable<AttendanceReportQuery["sortBy"]>) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: NonNullable<AttendanceReportQuery["sortBy"]> }) => (
    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort(sortKey)}>
      <span className="flex items-center gap-1">
        {label}
        {sortBy === sortKey ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : null}
      </span>
    </th>
  );

  const rows = data?.data ?? [];
  const summary = data?.summary;
  const pageInfo = data?.page;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-brand-muted">Reports &gt; Attendance</p>
          <h1 className="text-2xl font-bold text-brand-navy">Attendance Reports</h1>
        </div>
        <Button onClick={() => exportMutation.mutate("PDF")} disabled={exportMutation.isPending} className="shrink-0">
          {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Attendance Report
        </Button>
      </div>

      {/* Filters */}
      <SectionCard title="">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 -mt-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Employee Name</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
              <Input
                placeholder="Search employee…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Department</label>
            <Select
              value={departmentId || "ALL"}
              onValueChange={(v) => {
                setDepartmentId(v === "ALL" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-[10px] border-[#c3c6d2] bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Payroll Period</label>
            <Select
              value={payrollPeriodId || "ALL"}
              onValueChange={(v) => {
                setPayrollPeriodId(v === "ALL" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-[10px] border-[#c3c6d2] bg-white text-sm">
                <SelectValue placeholder="Current month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Current Month</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatDate(p.startDate)} - {formatDate(p.endDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => setShowMoreFilters((v) => !v)} className="h-10 flex-1">
              <SlidersHorizontal className="h-4 w-4" /> More Filters
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-10 w-10 p-0" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {showMoreFilters ? (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[#c3c6d2]/40 pt-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">From</label>
              <Input
                type="date"
                value={from}
                disabled={Boolean(payrollPeriodId)}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">To</label>
              <Input
                type="date"
                value={to}
                disabled={Boolean(payrollPeriodId)}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Status</label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v as AttendanceStatus | "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-[10px] border-[#c3c6d2] bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PERFECT">Perfect</SelectItem>
                  <SelectItem value="EXCELLENT">Excellent</SelectItem>
                  <SelectItem value="GOOD">Good</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* Table */}
      <SectionCard title="">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <EmptyState message="Couldn't load the attendance report." />
        ) : rows.length === 0 ? (
          <EmptyState message="No employees match this filter." />
        ) : (
          <div className="overflow-x-auto -mt-2">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <SortHeader label="Employee" sortKey="name" />
                  <th className="py-3 px-4">Department</th>
                  <SortHeader label="Days Logged" sortKey="daysLogged" />
                  <SortHeader label="Absences" sortKey="absences" />
                  <SortHeader label="Tardiness" sortKey="tardiness" />
                  <SortHeader label="Attendance %" sortKey="attendancePercent" />
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((r) => {
                  const initials = r.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <tr key={r.userId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4e2e3] text-xs font-bold text-brand-navy">
                            {initials}
                          </span>
                          <span className="font-semibold text-brand-navy">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-brand-muted">{r.department ?? "Unassigned"}</td>
                      <td className="py-3 px-4 text-brand-ink">
                        {r.daysLogged}/{r.expectedDays}
                      </td>
                      <td className={`py-3 px-4 font-semibold ${r.absences > 0 ? "text-red-600" : "text-brand-ink"}`}>{r.absences}</td>
                      <td className={`py-3 px-4 font-semibold ${r.tardiness > 0 ? "text-amber-600" : "text-brand-ink"}`}>{r.tardiness}</td>
                      <td className="py-3 px-4 text-brand-ink">{r.attendancePercent}%</td>
                      <td className="py-3 px-4">
                        <StatusBadge label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageInfo && pageInfo.total > 0 ? (
          <div className="mt-4 flex items-center justify-between border-t border-[#c3c6d2]/40 pt-3">
            <span className="text-xs text-brand-muted">
              Showing {(pageInfo.page - 1) * pageInfo.pageSize + 1} to {Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total)} of {pageInfo.total} employees
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageInfo.page === 1}
                className="rounded p-1.5 text-brand hover:bg-[#f5f6fa] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: pageInfo.totalPages }, (_, i) => i + 1)
                .slice(0, 5)
                .map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`h-7 w-7 rounded text-xs font-semibold ${n === pageInfo.page ? "bg-brand text-white" : "text-brand-navy hover:bg-[#f5f6fa]"}`}
                  >
                    {n}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageInfo.totalPages, p + 1))}
                disabled={pageInfo.page === pageInfo.totalPages}
                className="rounded p-1.5 text-brand hover:bg-[#f5f6fa] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Avg Attendance Rate</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : `${summary?.avgAttendanceRate ?? 0}%`}</span>
          </div>
        </div>
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Total Tardiness</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : summary?.totalTardiness ?? 0}</span>
            <span className="text-xs text-brand-muted">this period</span>
          </div>
        </div>
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Unexcused Absences</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600">{isLoading ? "…" : summary?.unexcusedAbsences ?? 0}</span>
            {summary && summary.unexcusedAbsences > 0 ? <span className="text-xs font-semibold text-red-600">Critical</span> : null}
          </div>
        </div>
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Pending Attendance Reviews</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : summary?.pendingReviews ?? 0}</span>
            <Bell className="h-4 w-4 text-brand" />
          </div>
        </div>
      </div>

      {/* Export format shortcuts */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("CSV")} disabled={exportMutation.isPending} className="text-xs">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("XLSX")} disabled={exportMutation.isPending} className="text-xs">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("PDF")} disabled={exportMutation.isPending} className="text-xs">
          <FileText className="h-3.5 w-3.5" /> Export PDF
        </Button>
      </div>
    </div>
  );
}
