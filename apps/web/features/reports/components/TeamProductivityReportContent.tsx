"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Calendar, 
  Search, 
  ArrowUpRight, 
  Download, 
  Loader2, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Trash2
} from "lucide-react";
import { 
  getTeamProductivity, 
  getTeamProductivitySummary, 
  generateReport,
  getReportsHistory,
  auditDownloadReport,
  deleteReport
} from "../api/reports.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { useAuth } from "@/providers/auth-provider";

export function TeamProductivityReportContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("ADMIN") || false;
  
  const isSupervisorOnly = user?.roles.some((r) => r === "SUPERVISOR") && !user?.roles.some((r) => r === "ADMIN" || r === "HR" || r === "FINANCE");

  // Filtering & Pagination parameter state
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("2023-10-01");
  const [endDate, setEndDate] = useState("2023-10-31");
  
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);

  const filterParams = {
    from: startDate || undefined,
    to: endDate || undefined,
    q: search || undefined,
    cursor: cursorStack[cursorIndex] || undefined,
    limit: 5,
  };

  // Report history state
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState("ALL");
  const [historyCursorStack, setHistoryCursorStack] = useState<(string | null)[]>([null]);
  const [historyCursorIndex, setHistoryCursorIndex] = useState(0);

  const historyQueryParams = {
    category: historyCategoryFilter === "ALL" ? undefined : historyCategoryFilter,
    cursor: historyCursorStack[historyCursorIndex] || undefined,
    limit: 5,
  };

  // Queries
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["team-productivity-summary", startDate, endDate],
    queryFn: () => getTeamProductivitySummary({ from: startDate, to: endDate }),
  });

  const { data: productivityData, isLoading: isTableLoading, refetch } = useQuery({
    queryKey: ["team-productivity-details", filterParams],
    queryFn: () => getTeamProductivity(filterParams),
  });

  const { data: historyData, isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["reports", "history", historyQueryParams],
    queryFn: () => getReportsHistory(historyQueryParams),
  });

  // Export Mutation
  const exportMutation = useMutation({
    mutationFn: (format: "CSV" | "XLSX" | "PDF") => 
      generateReport({
        category: "PAYROLL", // using existing category
        format,
        from: startDate,
        to: endDate,
      }),
    onSuccess: (data) => {
      setToast({ message: `Export job for ${data.name} queued successfully in BullMQ.`, tone: "success" });
      refetchHistory();
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Export failed.", tone: "error" });
    }
  });

  // Download Report Mutation
  const downloadMutation = useMutation({
    mutationFn: (id: string) => auditDownloadReport(id),
    onSuccess: (data) => {
      setToast({ message: `Report download logged successfully.`, tone: "success" });
      refetchHistory();
      if (data.filePath) {
        window.open(`/api/storage/${data.filePath}`, "_blank");
      }
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Download request failed.", tone: "error" });
    }
  });

  // Delete Report Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => {
      setToast({ message: `Report history deleted.`, tone: "success" });
      refetchHistory();
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Only Administrators can delete reports.", tone: "error" });
    }
  });

  const handleHistoryNextPage = () => {
    if (historyData?.page.nextCursor) {
      const nextCursor = historyData.page.nextCursor;
      setHistoryCursorStack((prev) => [...prev, nextCursor]);
      setHistoryCursorIndex((prev) => prev + 1);
    }
  };

  const handleHistoryPrevPage = () => {
    if (historyCursorIndex > 0) {
      setHistoryCursorIndex((prev) => prev - 1);
    }
  };

  const history = historyData?.data ?? [];

  const handleApplyFilters = () => {
    setCursorStack([null]);
    setCursorIndex(0);
    refetch();
  };

  const handleNextPage = () => {
    if (productivityData?.page.nextCursor) {
      const nextCursor = productivityData.page.nextCursor;
      setCursorStack((prev) => [...prev, nextCursor]);
      setCursorIndex((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (cursorIndex > 0) {
      setCursorIndex((prev) => prev - 1);
    }
  };

  const details = productivityData?.data ?? [];

  // Footer Totals
  const totalApproved = details.reduce((acc, row) => acc + row.approvedHours, 0);
  const totalPending = details.reduce((acc, row) => acc + row.pendingHours, 0);
  const totalRejected = details.reduce((acc, row) => acc + row.rejectedHours, 0);
  const totalPayroll = details.reduce((acc, row) => acc + row.payrollEstimate, 0);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header Row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy font-sans tracking-tight">Team Productivity Report</h1>
          <p className="text-sm text-brand-muted mt-1 leading-relaxed">
            Comprehensive breakdown of hours, attendance, and payroll estimations across your engineering and operations teams.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-xl border border-[#c3c6d2]/50 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs text-brand-navy font-semibold">
            <Calendar className="h-4 w-4 text-brand-muted" />
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="bg-transparent border-none outline-none text-xs font-bold text-brand-navy cursor-pointer"
            />
            <span className="text-[#c3c6d2]">-</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="bg-transparent border-none outline-none text-xs font-bold text-brand-navy cursor-pointer"
            />
          </div>
          <Button 
            onClick={handleApplyFilters} 
            size="sm" 
            className="h-8 text-xs font-bold bg-brand hover:bg-brand/90 text-white"
          >
            Apply
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Approved Hours */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Total Approved Hours</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-2">
              {isSummaryLoading ? "..." : (summary?.totalApprovedHours ?? "1,248.50")}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
              <CheckCircle2 className="h-3 w-3" /> {summary?.changePercent ?? "+4.2%"}
            </span>
          </div>
        </div>

        {/* Payroll Liability */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Est. Payroll Liability</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-2">
              {isSummaryLoading ? "..." : `₱${(summary?.payrollLiability ?? 42850).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-sky-50 text-[#0052cc] flex items-center justify-center">
            <DollarSign className="h-5 w-5 fill-current" />
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="rounded-[16px] border border-red-100 bg-red-50/10 p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Pending Approvals</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-2">
              {isSummaryLoading ? "..." : `${summary?.totalPendingHours ?? "34.00"} hrs`}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <button className="text-xs font-bold text-[#0052cc] hover:underline flex items-center gap-0.5">
              View Details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-sm">
        {/* Table Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-brand-navy">Hours, Attendance, & Payroll</h2>
          
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-brand-muted" />
              <Input 
                placeholder="Filter by name..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>

            {!isSupervisorOnly && (
              <div className="flex items-center gap-1 border border-[#c3c6d2] rounded-lg p-0.5 bg-white">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => exportMutation.mutate("CSV")} 
                  disabled={exportMutation.isPending} 
                  className="h-8 text-xs font-bold text-brand-navy flex items-center gap-1"
                >
                  CSV
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => exportMutation.mutate("XLSX")} 
                  disabled={exportMutation.isPending} 
                  className="h-8 text-xs font-bold text-brand-navy flex items-center gap-1"
                >
                  Excel
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => exportMutation.mutate("PDF")} 
                  disabled={exportMutation.isPending} 
                  className="h-8 text-xs font-bold text-brand-navy flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                <th className="py-3 px-4">Employee Name</th>
                <th className="py-3 px-4">Total Approved (hrs)</th>
                <th className="py-3 px-4">Pending (hrs)</th>
                <th className="py-3 px-4">Rejected (hrs)</th>
                <th className="py-3 px-4">Est. Total Payroll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {isTableLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand" />
                  </td>
                </tr>
              ) : details.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-brand-muted">
                    No active productivity records found for this period.
                  </td>
                </tr>
              ) : (
                details.map((row) => (
                  <tr key={row.userId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-brand-navy">{row.name}</div>
                      <div className="text-[10px] text-brand-muted font-medium">{row.role} • {row.department}</div>
                    </td>
                    <td className="py-4 px-4 text-brand-navy font-medium">
                      {row.approvedHours.toFixed(2)}
                    </td>
                    <td className="py-4 px-4 text-brand-navy">
                      {row.pendingHours > 0 ? (
                        <span className="bg-sky-50 text-[#0052cc] px-2 py-0.5 rounded text-xs font-bold">
                          +{row.pendingHours.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-brand-muted font-medium">0.00</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-[#be123c] font-semibold">
                      {row.rejectedHours > 0 ? row.rejectedHours.toFixed(2) : "0.00"}
                    </td>
                    <td className="py-4 px-4 text-brand-navy font-bold">
                      ₱{row.payrollEstimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {details.length > 0 && (
              <tfoot>
                <tr className="border-t border-[#c3c6d2]/40 bg-gray-50/50 font-bold text-brand-navy text-sm">
                  <td className="py-4 px-4">Totals</td>
                  <td className="py-4 px-4">{totalApproved.toFixed(2)}</td>
                  <td className="py-4 px-4 text-[#0052cc]">
                    {totalPending > 0 ? `+${totalPending.toFixed(2)}` : "0.00"}
                  </td>
                  <td className="py-4 px-4 text-[#be123c]">{totalRejected.toFixed(2)}</td>
                  <td className="py-4 px-4 text-brand-navy">
                    ₱{totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Cursor Pagination */}
        <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-6">
          <span className="text-xs text-brand-muted">
            Showing <span className="font-bold text-brand-navy">{details.length}</span> active team members
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={cursorIndex === 0}
              onClick={handlePrevPage}
              className="h-8.5 text-xs px-3"
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!productivityData?.page.nextCursor}
              onClick={handleNextPage}
              className="h-8.5 text-xs px-3"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {!isSupervisorOnly && (
        /* Reports Table & Generation History (Bottom Widget) */
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-brand-navy">Report Generation History</h2>
            <div className="flex items-center border border-[#c3c6d2] rounded-lg px-2 py-1 gap-1">
              <span className="text-xs text-brand-muted font-semibold">Category:</span>
              <select
                value={historyCategoryFilter}
                onChange={(e) => {
                  setHistoryCategoryFilter(e.target.value);
                  setHistoryCursorStack([null]);
                  setHistoryCursorIndex(0);
                }}
                className="bg-transparent text-xs font-bold text-brand-navy outline-none border-none cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="PAYROLL">Payroll</option>
                <option value="TIMESHEETS">Timesheets</option>
                <option value="LABOR_COST">Labor Cost</option>
                <option value="COMPLIANCE">Compliance</option>
                <option value="DEPARTMENT_ANALYTICS">Department Analytics</option>
              </select>
            </div>
          </div>

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
                      No reports generated yet. Click CSV, Excel, or PDF to generate reports.
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
                              className="h-8 text-xs font-semibold text-[#0052cc]"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(row.id)}
                                className="h-8 text-xs font-semibold text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-4">
            <span className="text-xs text-brand-muted">
              Report history logs (downloads count audited)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={historyCursorIndex === 0}
                onClick={handleHistoryPrevPage}
                className="h-8 text-xs px-3"
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!historyData?.page.nextCursor}
                onClick={handleHistoryNextPage}
                className="h-8 text-xs px-3"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
