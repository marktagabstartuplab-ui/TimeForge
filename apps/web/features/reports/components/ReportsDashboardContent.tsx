"use client";

import { useState } from "react";
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
  DollarSign,
  ArrowUpRight,
  Trash2,
  Play,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { 
  getReportsDashboard, 
  getReportsHistory, 
  generateReport, 
  auditDownloadReport, 
  deleteReport 
} from "../api/reports.service";
import { TeamProductivityReportContent } from "./TeamProductivityReportContent";

export function ReportsDashboardContent() {
  const [activeTab, setActiveTab] = useState<"admin" | "productivity">("admin");
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  
  // Filtering & Pagination parameter state
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);

  const queryParams = {
    category: categoryFilter === "ALL" ? undefined : categoryFilter,
    cursor: cursorStack[cursorIndex] || undefined,
    limit: 5,
  };

  // Queries
  const { data: dashboard, isLoading: isDashLoading } = useQuery({
    queryKey: ["reports", "dashboard"],
    queryFn: () => getReportsDashboard({}),
  });

  const { data: historyData, isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["reports", "history", queryParams],
    queryFn: () => getReportsHistory(queryParams),
  });

  // Generate Report Mutation
  const generateMutation = useMutation({
    mutationFn: (category: string) => generateReport({ category, format: "PDF" }),
    onSuccess: (data) => {
      setToast({ message: `Report "${data.name}" generation queued.`, tone: "success" });
      refetchHistory();
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Generation failed.", tone: "error" });
    }
  });

  // Download Report Mutation
  const downloadMutation = useMutation({
    mutationFn: (id: string) => auditDownloadReport(id),
    onSuccess: (data) => {
      setToast({ message: `Report download logged successfully.`, tone: "success" });
      refetchHistory();
      if (data.filePath) {
        // mock download file trigger
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

  const handleNextPage = () => {
    if (historyData?.page.nextCursor) {
      const nextCursor = historyData.page.nextCursor;
      setCursorStack((prev) => [...prev, nextCursor]);
      setCursorIndex((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (cursorIndex > 0) {
      setCursorIndex((prev) => prev - 1);
    }
  };

  const history = historyData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[#c3c6d2]/30 pb-4">
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-2xl font-bold text-brand-navy">Administrative Reports</h1>
            <p className="text-sm text-brand-muted">Global performance metrics and organizational audit logs.</p>
          </div>

          {/* Tab triggers */}
          <div className="flex items-center gap-1 rounded-[10px] bg-[#f6f3f4] p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("admin")}
              className={`flex h-9 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition-all ${
                activeTab === "admin"
                  ? "bg-brand text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-navy"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Admin Reports
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("productivity")}
              className={`flex h-9 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition-all ${
                activeTab === "productivity"
                  ? "bg-brand text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-navy"
              }`}
            >
              <FileText className="h-4 w-4" />
              Productivity Report
            </button>
          </div>
        </div>
      </div>

      {activeTab === "productivity" ? (
        <TeamProductivityReportContent />
      ) : (
      <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="border border-[#c3c6d2] rounded-lg px-2.5 py-1 text-xs font-semibold bg-white flex items-center gap-1.5 cursor-pointer">
            <Calendar className="h-3.5 w-3.5 text-brand-muted" />
            <span className="text-brand-navy">Current Quarter</span>
          </div>
          <Button variant="outline" size="sm" className="h-8.5 text-xs font-semibold">
            <Filter className="h-3.5 w-3.5 mr-1" /> Filters
          </Button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Labor Cost */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted uppercase tracking-wider">
            <span>Total Labor Cost (QTD)</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">+4.2%</span>
          </div>
          <div className="text-2xl font-extrabold text-brand-navy mt-2">
            ${dashboard?.laborCost.toLocaleString() ?? "4,822,150"}
          </div>
          <div className="mt-3">
            <ProgressBar percent={72} className="h-1" />
          </div>
        </div>

        {/* Attendance */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted uppercase tracking-wider">
            <span>Avg. Workforce Attendance</span>
            <span className="text-brand-muted font-medium">Steady</span>
          </div>
          <div className="text-2xl font-extrabold text-brand-navy mt-2">
            {dashboard?.attendanceRate ?? "96.4"}%
          </div>
          <div className="text-xs text-brand-muted mt-3">Target: 95.0%</div>
        </div>

        {/* Active Users */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted uppercase tracking-wider">
            <span>Active Users vs. Licenses</span>
            <span className="text-[#be123c] bg-red-50 px-1.5 py-0.5 rounded">82% Cap</span>
          </div>
          <div className="text-2xl font-extrabold text-brand-navy mt-2">
            {dashboard?.activeUsers ?? "1,240"} / 1,500
          </div>
          <div className="mt-3">
            <ProgressBar percent={82} className="h-1 [&>div]:bg-[#be123c]" />
          </div>
        </div>

        {/* Compliance */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted uppercase tracking-wider">
            <span>System Compliance Score</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Excellent</span>
          </div>
          <div className="text-2xl font-extrabold text-brand-navy mt-2">
            {dashboard?.complianceScore ?? "98.2"}
          </div>
          <div className="text-xs text-brand-muted mt-3">Last audit: 2 days ago</div>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Labor Distribution */}
        <div className="lg:col-span-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <h2 className="text-base font-bold text-brand-navy mb-6">Labor Distribution by Department</h2>
          <div className="h-56 flex items-end justify-between px-6 border-b border-[#c3c6d2]/40 pb-4">
            {(dashboard?.laborDistribution ?? [
              { name: "Engineering", cost: 1200000 },
              { name: "Marketing", cost: 800000 },
              { name: "Operations", cost: 1400000 },
              { name: "Sales", cost: 600000 },
              { name: "Legal/HR", cost: 400000 },
            ]).map((dept, i) => (
              <div key={i} className="flex flex-col items-center gap-2 w-16">
                <div 
                  className={cn(
                    "w-6 rounded-t transition-colors cursor-pointer",
                    i === 2 ? "bg-[#0052cc]" : "bg-sky-100 hover:bg-[#0052cc]"
                  )} 
                  style={{ height: `${Math.max(20, Math.min(180, (dept.cost / 1500000) * 150))}px` }}
                ></div>
                <span className="text-[10px] font-bold text-brand-navy text-center truncate w-full">{dept.name}</span>
                <span className="text-[10px] text-brand-muted font-medium">${(dept.cost / 1000000).toFixed(1)}M</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quarterly Attendance (Right Widget) */}
        <div className="rounded-[16px] bg-[#0052cc] text-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold">Quarterly Attendance</h2>
            <p className="text-xs text-sky-100 mt-1 leading-relaxed">Visualizing consistency across all departments in Q3.</p>
          </div>

          <div className="my-6 h-20 flex items-center justify-center">
            {/* Draw a wavy attendance line chart */}
            <svg className="w-full h-16" viewBox="0 0 200 60">
              <path 
                d="M 10 30 Q 50 10, 80 35 T 150 20 T 190 30" 
                fill="none" 
                stroke="#ffffff" 
                strokeWidth="3.5" 
                strokeLinecap="round"
              />
              <circle cx="80" cy="35" r="4" fill="#ffffff" />
              <circle cx="150" cy="20" r="4" fill="#ffffff" />
            </svg>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-100">PEAK PERFORMANCE</span>
              <span className="text-sm font-bold block mt-1">August</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-100">AVG %</span>
              <span className="text-sm font-bold block mt-1">98.1%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log vs Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Admin Logs */}
        <div className="lg:col-span-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-brand-navy">Admin Activity & Security Audit</h2>
            <button className="text-xs font-semibold text-[#0052cc] hover:underline">View All Logs</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/30 text-brand-muted uppercase font-bold">
                  <th className="py-2.5">ACTION / EVENT</th>
                  <th className="py-2.5">ADMINISTRATOR</th>
                  <th className="py-2.5">TIMESTAMP</th>
                  <th className="py-2.5">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/20">
                {(dashboard?.auditLogs ?? []).map((log, idx) => {
                  let tone: BadgeTone = "success";
                  if (log.status === "REJECTED") tone = "danger";

                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 font-semibold text-brand-navy flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-brand-muted" />
                        {log.action}
                      </td>
                      <td className="py-3 text-brand-muted">{log.actor}</td>
                      <td className="py-3 text-brand-muted">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="py-3">
                        <StatusBadge label={log.status} tone={tone} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick actions panel */}
        <div className="flex flex-col gap-6">
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            <h3 className="text-xs font-bold text-brand-navy uppercase tracking-wider mb-3">Quick Export Actions</h3>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => generateMutation.mutate("PAYROLL")} className="justify-between w-full h-11 text-xs font-bold text-brand-navy border-gray-200">
                <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-[#0052cc]" /> Monthly Financial</span>
                <Download className="h-3.5 w-3.5 text-brand-muted" />
              </Button>
              <Button variant="outline" onClick={() => generateMutation.mutate("COMPLIANCE")} className="justify-between w-full h-11 text-xs font-bold text-brand-navy border-gray-200">
                <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-[#be123c]" /> Security Audit Trail</span>
                <Download className="h-3.5 w-3.5 text-brand-muted" />
              </Button>
              <Button variant="outline" onClick={() => generateMutation.mutate("ATTENDANCE")} className="justify-between w-full h-11 text-xs font-bold text-brand-navy border-gray-200">
                <span className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-emerald-600" /> License Utilization</span>
                <Download className="h-3.5 w-3.5 text-brand-muted" />
              </Button>
            </div>
          </div>

          <div className="rounded-[16px] border border-sky-100 bg-[#f0f9ff]/30 p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] relative overflow-hidden flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-brand-navy">Custom Report Builder</h3>
              <p className="text-xs text-brand-muted mt-2 leading-relaxed">
                Design complex datasets with nested filters and automated scheduling.
              </p>
            </div>
            <Button 
              variant="default" 
              onClick={() => generateMutation.mutate("DEPARTMENT_ANALYTICS")}
              className="mt-4 w-full h-10 text-xs font-bold bg-brand-navy hover:bg-brand-navy/90 flex items-center justify-center gap-1"
            >
              Launch Builder <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Reports Table & Generation History (Bottom Widget) */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-brand-navy">Report Generation History</h2>
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
                    No reports generated yet. Click Quick Actions or Launch Builder to generate reports.
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

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-4">
          <span className="text-xs text-brand-muted">
            Report history logs (downloads count audited)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={cursorIndex === 0}
              onClick={handlePrevPage}
              className="h-8 text-xs px-3"
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!historyData?.page.nextCursor}
              onClick={handleNextPage}
              className="h-8 text-xs px-3"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
