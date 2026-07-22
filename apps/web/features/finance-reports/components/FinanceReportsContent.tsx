"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Search,
  Filter,
  Calendar,
  Building,
  UserCheck,
  Shield,
  FileText,
  ArrowUpRight,
  Trash2,
  Play,
  BarChart3,
  Clock,
  Users,
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { ErrorState } from "@/components/shared/ErrorState";
import { PesoIcon } from "@/components/shared/PesoIcon";
import {
  getFinanceDashboard,
  getFinancePayrollReport,
  getOvertimeAnalysis,
  type FinanceDashboardResponse,
  type FinancePayrollReportResponse,
  type OvertimeAnalysisResponse,
} from "../api/finance-reports.service";
import {
  getReportsHistory,
  generateReport,
  auditDownloadReport,
  deleteReport,
  type ReportsQuery,
  type GeneratedReportItem,
} from "@/features/reports/api/reports.service";
import {
  getAttendanceReport,
  type AttendanceReportQuery,
  type AttendanceStatus,
} from "@/features/attendance-reports/api/attendance-reports.service";

const PIE_COLORS = ["#0052cc", "#0ea5e9", "#0f172a", "#38bdf8", "#818cf8", "#f59e0b", "#10b981", "#ef4444"];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return `₱${value.toFixed(2)}`;
}

const attendanceStatusConfig: Record<AttendanceStatus, { label: string; tone: BadgeTone }> = {
  PERFECT: { label: "Perfect", tone: "success" },
  EXCELLENT: { label: "Excellent", tone: "brand" },
  GOOD: { label: "Good", tone: "info" },
  CRITICAL: { label: "Critical", tone: "danger" },
};

export function FinanceReportsContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "attendance" | "history">("dashboard");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);

  // Attendance report filters
  const [attendanceQuery, setAttendanceQuery] = useState<AttendanceReportQuery>({
    page: 1,
    pageSize: 10,
    sortBy: "name",
    sortDir: "asc",
  });

  const queryParams: ReportsQuery = {
    category: categoryFilter === "ALL" ? undefined : categoryFilter,
    cursor: cursorStack[cursorIndex] || undefined,
    limit: 5,
  };

  // ─── Queries ──────────────────────────────────────────────────────────────────

  const { data: dashboard, isLoading: isDashLoading, isError: isDashError, refetch: refetchDash } = useQuery({
    queryKey: ["finance-reports", "dashboard"],
    queryFn: () => getFinanceDashboard({}),
  });

  const { data: payrollReport, isLoading: isPayrollLoading } = useQuery({
    queryKey: ["finance-reports", "payroll"],
    queryFn: () => getFinancePayrollReport({ limit: 6 }),
  });

  const { data: overtime, isLoading: isOvertimeLoading } = useQuery({
    queryKey: ["finance-reports", "overtime"],
    queryFn: () => getOvertimeAnalysis({}),
  });

  // Quick Export Actions results land in "Report History", not inline — poll
  // while anything is pending so pendingExportIds (below) can auto-download
  // the moment a tracked job finishes, without the user having to switch tabs.
  const { data: historyData, isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["reports", "history", queryParams],
    queryFn: () => getReportsHistory(queryParams),
    refetchInterval: (query) => {
      const data = query.state.data;
      return (data?.data ?? []).some((r) => r.status === "PENDING") ? 3000 : false;
    },
  });

  // Reports queued from Quick Export Actions, tracked by id until they leave
  // PENDING — lets the button itself show progress and auto-download on
  // completion instead of requiring a trip to the Report History tab.
  const [pendingExportIds, setPendingExportIds] = useState<Record<string, string>>({});

  const downloadMutation = useMutation({
    mutationFn: (id: string) => auditDownloadReport(id),
    onSuccess: (data) => {
      setToast({ message: "Report download logged.", tone: "success" });
      refetchHistory();
      if (data.filePath) {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
        window.open(`${baseUrl}/api/v1/storage/${data.filePath}`, "_blank");
      }
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Download failed.", tone: "error" });
    },
  });

  useEffect(() => {
    if (Object.keys(pendingExportIds).length === 0) return;
    const rows = historyData?.data ?? [];
    for (const [category, id] of Object.entries(pendingExportIds)) {
      const row = rows.find((r) => r.id === id);
      if (!row || row.status === "PENDING") continue;
      setPendingExportIds((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      if (row.status === "COMPLETED" && row.filePath) {
        downloadMutation.mutate(row.id);
      } else if (row.status === "FAILED") {
        setToast({ message: `"${row.name}" failed to generate.`, tone: "error" });
      }
    }
  }, [historyData, pendingExportIds]);

  const { data: attendanceData, isLoading: isAttendanceLoading, refetch: refetchAttendance } = useQuery({
    queryKey: ["reports", "attendance-report", attendanceQuery],
    queryFn: () => getAttendanceReport(attendanceQuery),
  });

  const generateMutation = useMutation({
    mutationFn: (category: string) => generateReport({ category, format: "PDF" }),
    onSuccess: (data, category) => {
      setToast({ message: `Generating "${data.name}"... it'll download automatically when ready.`, tone: "success" });
      setPendingExportIds((prev) => ({ ...prev, [category]: data.id }));
      refetchHistory();
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Generation failed.", tone: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => {
      setToast({ message: "Report deleted.", tone: "success" });
      refetchHistory();
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Only Administrators can delete reports.", tone: "error" });
    },
  });

  // ─── Derived data for charts ──────────────────────────────────────────────────

  const payrollTrendData = useMemo(() => {
    if (!payrollReport?.lineItems) return [];
    const grouped = new Map<string, { pay: number; count: number }>();
    for (const li of payrollReport.lineItems) {
      const key = li.employee;
      const entry = grouped.get(key) ?? { pay: 0, count: 0 };
      entry.pay += li.estimatedPay;
      entry.count++;
      grouped.set(key, entry);
    }
    return Array.from(grouped.entries())
      .map(([name, d]) => ({ name, pay: d.pay }))
      .sort((a, b) => b.pay - a.pay)
      .slice(0, 10);
  }, [payrollReport]);

  const deptCostData = useMemo(() => {
    if (!payrollReport?.lineItems) return [];
    const grouped = new Map<string, number>();
    for (const li of payrollReport.lineItems) {
      const dept = li.department ?? "Unassigned";
      grouped.set(dept, (grouped.get(dept) ?? 0) + li.estimatedPay);
    }
    return Array.from(grouped.entries())
      .map(([name, cost]) => ({ name, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [payrollReport]);

  const history = historyData?.data ?? [];

  const handleNextPage = () => {
    if (historyData?.page.nextCursor) {
      setCursorStack((prev) => [...prev, historyData.page.nextCursor]);
      setCursorIndex((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (cursorIndex > 0) {
      setCursorIndex((prev) => prev - 1);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 pb-4">
        <div className="flex items-center gap-4 w-full">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-brand-navy">Finance Reports</h1>
            <p className="text-sm text-brand-muted">Payroll analytics, attendance reports, and compliance overview</p>
          </div>
          <div className="flex items-center gap-1 rounded-[10px] bg-[#f6f3f4] p-1 shadow-sm">
            {(["dashboard", "attendance", "history"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex h-9 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition-all ${
                  activeTab === tab
                    ? "bg-brand text-white shadow-sm"
                    : "text-brand-muted hover:text-brand-navy"
                }`}
              >
                {tab === "dashboard" && <BarChart3 className="h-4 w-4" />}
                {tab === "attendance" && <UserCheck className="h-4 w-4" />}
                {tab === "history" && <FileText className="h-4 w-4" />}
                {tab === "dashboard" ? "Dashboard" : tab === "attendance" ? "Attendance Report" : "Report History"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "dashboard" && (
        <>
          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isDashLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
                  <Skeleton className="mb-2 h-4 w-20" />
                  <Skeleton className="mb-1 h-7 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))
            ) : isDashError ? (
              <div className="col-span-full">
                <ErrorState onRetry={refetchDash} />
              </div>
            ) : dashboard ? (
              <>
                <DashboardCard
                  icon={UserCheck}
                  label="Attendance Rate"
                  value={`${dashboard.attendance.value}%`}
                  change={dashboard.attendance.change}
                  previous={dashboard.attendance.previous}
                />
                <DashboardCard
                  icon={PesoIcon}
                  label="Labor Cost"
                  value={formatCurrency(dashboard.laborCost.value)}
                  change={dashboard.laborCost.change}
                  previous={dashboard.laborCost.previous}
                />
                <DashboardCard
                  icon={BarChart3}
                  label="Payroll Periods"
                  value={`${dashboard.payroll.value}`}
                  change={dashboard.payroll.change}
                  previous={dashboard.payroll.previous}
                />
                <DashboardCard
                  icon={Shield}
                  label="Compliance Score"
                  value={`${dashboard.compliance.value}%`}
                  change={dashboard.compliance.change}
                  previous={dashboard.compliance.previous}
                />
              </>
            ) : null}
          </div>

          {/* Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Payroll by Employee">
              {isPayrollLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : payrollTrendData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payrollTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm">
                              <p className="font-medium text-brand-navy">{payload[0].name}</p>
                              <p className="text-brand">{formatCurrency(Number(payload[0].value))}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="pay" fill="#0052cc" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">
                  No payroll data available.
                </div>
              )}
            </SectionCard>

            <SectionCard title="Department Cost Breakdown">
              {isPayrollLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : deptCostData.length > 0 ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deptCostData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          dataKey="cost"
                          nameKey="name"
                        >
                          {deptCostData.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm">
                                <p className="font-medium text-brand-navy">{payload[0].name}</p>
                                <p className="text-brand">{formatCurrency(Number(payload[0].value))}</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex w-full flex-col gap-1.5">
                    {deptCostData.slice(0, 6).map((dept, idx) => (
                      <div key={dept.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="text-brand-muted">{dept.name}</span>
                        </div>
                        <span className="font-medium text-brand-navy">{formatCurrency(dept.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">
                  No department cost data.
                </div>
              )}
            </SectionCard>
          </div>

          {/* Overtime Analysis + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SectionCard title="Overtime Analysis" className="lg:col-span-2">
              {isOvertimeLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-[200px] w-full" />
                </div>
              ) : overtime ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                      <p className="text-xs text-brand-muted font-semibold">Total Overtime</p>
                      <p className="text-lg font-bold text-brand-navy">{overtime.totalOvertimeHours.toFixed(1)} hrs</p>
                    </div>
                    <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                      <p className="text-xs text-brand-muted font-semibold">Overtime Cost</p>
                      <p className="text-lg font-bold text-brand-navy">{formatCurrency(overtime.totalOvertimeCost)}</p>
                    </div>
                    <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                      <p className="text-xs text-brand-muted font-semibold">Affected Employees</p>
                      <p className="text-lg font-bold text-brand-navy">{overtime.affectedEmployees}</p>
                    </div>
                  </div>
                  {overtime.byDepartment.length > 0 && (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overtime.byDepartment} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="department" tick={{ fontSize: 11 }} width={100} />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm">
                                  <p className="font-medium text-brand-navy">{payload[0].name}</p>
                                  <p className="text-brand">{Number(payload[0].value).toFixed(1)} hrs</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="hours" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">
                  No overtime data available.
                </div>
              )}
            </SectionCard>

            <div className="flex flex-col gap-6">
              <SectionCard title="Quick Export Actions">
                <div className="flex flex-col gap-2">
                  {[
                    { category: "PAYROLL", label: "Payroll Summary", icon: <PesoIcon className="h-4 w-4 text-brand" /> },
                    { category: "ATTENDANCE", label: "Attendance Export", icon: <UserCheck className="h-4 w-4 text-emerald-600" /> },
                    { category: "LABOR_COST", label: "Labor Cost Report", icon: <BarChart3 className="h-4 w-4 text-[#f59e0b]" /> },
                    { category: "COMPLIANCE", label: "Compliance Report", icon: <Shield className="h-4 w-4 text-[#be123c]" /> },
                  ].map(({ category, label, icon }) => {
                    const isPending = category in pendingExportIds;
                    return (
                      <Button
                        key={category}
                        variant="outline"
                        size="sm"
                        className="justify-between w-full"
                        disabled={isPending}
                        onClick={() => generateMutation.mutate(category)}
                      >
                        <span className="flex items-center gap-2">{icon} {label}</span>
                        {isPending ? (
                          <span className="flex items-center gap-1 text-xs text-brand-muted">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                          </span>
                        ) : (
                          <Download className="h-3.5 w-3.5 text-brand-muted" />
                        )}
                      </Button>
                    );
                  })}
                </div>
              </SectionCard>

              <div className="rounded-[16px] border border-sky-100 bg-[#f0f9ff]/30 p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                <h3 className="text-sm font-bold text-brand-navy">Period Overview</h3>
                <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                  {payrollReport ? `${payrollReport.totalEmployees} employees · ${formatCurrency(payrollReport.totalGrossPayroll)} gross payroll` : "Loading..."}
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => { setActiveTab("history"); }}
                  className="mt-4 w-full h-10 text-xs font-bold bg-brand-navy hover:bg-brand-navy/90"
                >
                  View Full History <ArrowUpRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "attendance" && (
        <>
          {/* Attendance Report Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 border border-[#c3c6d2] rounded-lg px-3 py-1.5 bg-white">
              <Search className="h-4 w-4 text-brand-muted" />
              <input
                type="text"
                placeholder="Search employee..."
                className="bg-transparent text-sm text-brand-navy outline-none border-none w-40"
                value={attendanceQuery.search ?? ""}
                onChange={(e) => setAttendanceQuery((q) => ({ ...q, search: e.target.value || undefined, page: 1 }))}
              />
            </div>
            <div className="flex items-center gap-1 border border-[#c3c6d2] rounded-lg px-2 py-1 bg-white">
              <Filter className="h-3.5 w-3.5 text-brand-muted" />
              <select
                value={attendanceQuery.status ?? "ALL"}
                onChange={(e) => setAttendanceQuery((q) => ({ ...q, status: e.target.value === "ALL" ? undefined : e.target.value as AttendanceStatus, page: 1 }))}
                className="bg-transparent text-xs font-semibold text-brand-navy outline-none border-none cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="PERFECT">Perfect</option>
                <option value="EXCELLENT">Excellent</option>
                <option value="GOOD">Good</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                refetchAttendance();
                setToast({ message: "Attendance report refreshed.", tone: "success" });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>

          {/* Attendance Summary */}
          {attendanceData && (
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                <p className="text-xs text-brand-muted font-semibold">Avg Attendance</p>
                <p className="text-lg font-bold text-brand-navy">{attendanceData.summary.avgAttendanceRate}%</p>
              </div>
              <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                <p className="text-xs text-brand-muted font-semibold">Total Tardiness</p>
                <p className="text-lg font-bold text-brand-navy">{attendanceData.summary.totalTardiness}</p>
              </div>
              <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                <p className="text-xs text-brand-muted font-semibold">Unexcused Absences</p>
                <p className="text-lg font-bold text-brand-navy">{attendanceData.summary.unexcusedAbsences}</p>
              </div>
              <div className="rounded-[12px] bg-[#f6f3f4] p-3">
                <p className="text-xs text-brand-muted font-semibold">Pending Reviews</p>
                <p className="text-lg font-bold text-brand-navy">{attendanceData.summary.pendingReviews}</p>
              </div>
            </div>
          )}

          {/* Attendance Table */}
          <SectionCard title="Employee Attendance">
            {isAttendanceLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : attendanceData && attendanceData.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                      <th className="py-3 px-4 cursor-pointer select-none" onClick={() => setAttendanceQuery((q) => ({ ...q, sortBy: "name", sortDir: q.sortDir === "asc" ? "desc" : "asc" }))}>
                        <span className="flex items-center gap-1">Employee <ArrowUpDown className="h-3 w-3" /></span>
                      </th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 cursor-pointer select-none" onClick={() => setAttendanceQuery((q) => ({ ...q, sortBy: "attendancePercent", sortDir: q.sortDir === "asc" ? "desc" : "asc" }))}>
                        <span className="flex items-center gap-1">Attendance % <ArrowUpDown className="h-3 w-3" /></span>
                      </th>
                      <th className="py-3 px-4">Days Logged</th>
                      <th className="py-3 px-4">Absences</th>
                      <th className="py-3 px-4">Tardiness</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {attendanceData.data.map((row) => {
                      const cfg = attendanceStatusConfig[row.status] ?? { label: row.status, tone: "neutral" as BadgeTone };
                      return (
                        <tr key={row.userId} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="py-3 px-4 font-semibold text-brand-navy">{row.name}</td>
                          <td className="py-3 px-4 text-brand-muted text-xs">{row.department ?? "—"}</td>
                          <td className="py-3 px-4 font-semibold">{row.attendancePercent}%</td>
                          <td className="py-3 px-4 text-brand-muted">{row.daysLogged} / {row.expectedDays}</td>
                          <td className="py-3 px-4 text-brand-muted">{row.absences}</td>
                          <td className="py-3 px-4 text-brand-muted">{row.tardiness}</td>
                          <td className="py-3 px-4">
                            <StatusBadge label={cfg.label} tone={cfg.tone} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-brand-muted">
                No attendance data found for the selected period.
              </div>
            )}

            {/* Pagination */}
            {attendanceData && (
              <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-2">
                <span className="text-xs text-brand-muted">
                  Page {attendanceData.page.page} of {attendanceData.page.totalPages} ({attendanceData.page.total} entries)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={attendanceData.page.page <= 1}
                    onClick={() => setAttendanceQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
                    className="h-8 text-xs px-3"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={attendanceData.page.page >= attendanceData.page.totalPages}
                    onClick={() => setAttendanceQuery((q) => ({ ...q, page: Math.min(attendanceData.page.totalPages, (q.page ?? 1) + 1) }))}
                    className="h-8 text-xs px-3"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {activeTab === "history" && (
        <>
          {/* Report History */}
          <SectionCard
            title="Report Generation History"
            action={
              <div className="flex items-center border border-[#c3c6d2] rounded-lg px-2 py-1 gap-1">
                <span className="text-xs text-brand-muted font-semibold">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setCursorStack([null]);
                    setCursorIndex(0);
                  }}
                  className="bg-transparent text-xs font-bold text-brand-navy outline-none border-none cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  <option value="ATTENDANCE">Attendance</option>
                  <option value="PAYROLL">Payroll</option>
                  <option value="TIMESHEETS">Timesheets</option>
                  <option value="LABOR_COST">Labor Cost</option>
                  <option value="COMPLIANCE">Compliance</option>
                </select>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                    <th className="py-3 px-4">Report Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Generated By</th>
                    <th className="py-3 px-4">Date Range</th>
                    <th className="py-3 px-4">Generated On</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c3c6d2]/30">
                  {isHistoryLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-28"></div></td>
                        <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-20"></div></td>
                        <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-32"></div></td>
                        <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                        <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                        <td className="py-4 px-4"><div className="h-6 bg-gray-100 rounded w-16"></div></td>
                        <td className="py-4 px-4"><div className="h-6 bg-gray-100 rounded w-12"></div></td>
                      </tr>
                    ))
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-brand-muted text-xs">
                        No reports generated yet. Use quick actions to generate reports.
                      </td>
                    </tr>
                  ) : (
                    history.map((row) => {
                      let tone: BadgeTone = "success";
                      if (row.status === "FAILED") tone = "danger";
                      else if (row.status === "PENDING") tone = "warning";
                      return (
                        <tr key={row.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="py-4 px-4 text-brand-navy font-semibold">{row.name}</td>
                          <td className="py-4 px-4 text-xs font-semibold text-brand-muted">{row.category}</td>
                          <td className="py-4 px-4 text-brand-muted">{row.creator.firstName} {row.creator.lastName}</td>
                          <td className="py-4 px-4 text-brand-muted text-xs">{row.dateRange || "All-time"}</td>
                          <td className="py-4 px-4 text-brand-muted text-xs">{new Date(row.createdAt).toLocaleDateString()}</td>
                          <td className="py-4 px-4">
                            <StatusBadge label={row.status} tone={tone} />
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={row.status !== "COMPLETED"}
                                onClick={() => downloadMutation.mutate(row.id)}
                                className="h-8 text-xs font-semibold text-brand"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(row.id)}
                                className="h-8 text-xs font-semibold text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-2">
              <span className="text-xs text-brand-muted">Report history · downloads are audited</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={cursorIndex === 0} onClick={handlePrevPage} className="h-8 text-xs px-3">
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={!historyData?.page.nextCursor} onClick={handleNextPage} className="h-8 text-xs px-3">
                  Next
                </Button>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Dashboard Card sub-component ──────────────────────────────────────────────────

function DashboardCard({
  icon: Icon,
  label,
  value,
  change,
  previous,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  change: number | null;
  previous: number;
}) {
  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <Icon className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        {change === null ? (
          <span className="flex items-center gap-0.5 rounded-full bg-[#f6f3f4] px-2 py-0.5 text-xs font-bold text-brand-muted">
            New
          </span>
        ) : (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold",
              change >= 0 ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]",
            )}
          >
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-brand-muted font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-ink">{value}</p>
      <p className="mt-0.5 text-xs text-brand-muted">Previous: {previous}{previous >= 100 ? "%" : ""}</p>
    </div>
  );
}
