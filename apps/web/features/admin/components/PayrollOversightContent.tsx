"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Wallet, 
  RefreshCw, 
  FileCheck2, 
  Zap, 
  Download, 
  Plus, 
  Check, 
  FileText,
  FileSpreadsheet,
  Loader2
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogCloseButton } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { GeneratePayrollModal } from "./GeneratePayrollModal";
import { 
  getPayrollDashboard, 
  getPayrollDistribution, 
  runPayrollAction, 
  exportPayroll 
} from "../api/payroll-oversight.service";

// Harmonious colors for donut chart
const COLORS = ["#0052cc", "#0ea5e9", "#0f172a", "#38bdf8", "#818cf8"];

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${s.toLocaleDateString("en-US", opt)} - ${e.toLocaleDateString("en-US", opt)}`;
}

export function PayrollOversightContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [newPayrunOpen, setNewPayrunOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"PDF" | "CSV" | "XLSX">("PDF");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);
  const [exportQueued, setExportQueued] = useState(false);

  // Queries
  const { data: dashboard, isLoading: isDashboardLoading } = useQuery({
    queryKey: ["payroll", "dashboard"],
    queryFn: getPayrollDashboard,
    refetchInterval: 30_000,
  });

  const { data: distribution, isLoading: isDistributionLoading } = useQuery({
    queryKey: ["payroll", "distribution"],
    queryFn: getPayrollDistribution,
    refetchInterval: 30_000,
  });

  // Mutations
  const actionMutation = useMutation({
    mutationFn: runPayrollAction,
    onSuccess: (_, variables) => {
      const msg = variables.action === "generate" ? "Payroll period calculation initiated." : "Payroll period approved and locked.";
      setToast({ message: msg, tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Action failed.", tone: "error" });
    }
  });

  const handleExport = async () => {
    setIsExporting(true);
    setExportQueued(false);
    try {
      await exportPayroll({ format: exportFormat, periodId: selectedPeriodId });
      setExportQueued(true);
      setToast({ message: "Export queued. You'll get a notification with the download link when it's ready.", tone: "success" });
    } catch (err: any) {
      setToast({ message: err?.message || "Export failed.", tone: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const totals = dashboard?.cards;

  const chartData = distribution?.departments ?? [];
  const totalSpendFormatted = distribution ? `₱${(distribution.totalSpend / 1000000).toFixed(1)}M` : "₱0.0M";

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Admin Payroll Oversight</h1>
          <p className="text-sm text-brand-muted">Global payroll management and financial reporting for the current fiscal cycle.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => {
              setSelectedPeriodId(undefined);
              setExportQueued(false);
              setExportOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Button 
            onClick={() => setNewPayrunOpen(true)}
            className="flex items-center gap-2 bg-[#0052cc] hover:bg-[#004bb3] text-white"
          >
            <Plus className="h-4 w-4" /> New Payrun
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Org Payroll */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <div className="rounded-[10px] bg-[#e6f0ff] p-2 text-[#0052cc]">
              <Wallet className="h-5 w-5" />
            </div>
            {totals?.totalPayroll.trend ? (
              <span className="text-xs font-semibold text-[#10b981] bg-[#e6fbf3] px-2 py-0.5 rounded-full">
                {totals.totalPayroll.trend} vs last mo
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-sm font-medium text-brand-muted">Total Org Payroll</p>
          <p className="mt-1 text-2xl font-bold text-brand-ink">
            {isDashboardLoading ? "..." : `₱${(totals?.totalPayroll.value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>

        {/* Active Payruns */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <div className="rounded-[10px] bg-[#f0fdf4] p-2 text-[#15803d]">
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-brand-muted">Active Payruns</p>
          <p className="mt-1 text-2xl font-bold text-brand-ink">
            {isDashboardLoading ? "..." : totals?.activePayruns.value ?? 0}
          </p>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
            <div className="bg-[#0052cc] h-1.5 rounded-full" style={{ width: "70%" }}></div>
          </div>
        </div>

        {/* Pending HR Approvals */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <div className="rounded-[10px] bg-[#fff1f2] p-2 text-[#be123c]">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <span className="text-xs font-semibold text-[#be123c] bg-[#fff1f2] px-2 py-0.5 rounded-full">
              Requires immediate action
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-brand-muted">Pending HR Approvals</p>
          <p className="mt-1 text-2xl font-bold text-brand-ink">
            {isDashboardLoading ? "..." : totals?.pendingHRApprovals.value ?? 0}
          </p>
        </div>

        {/* Average Pay Efficiency */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <div className="rounded-[10px] bg-[#f0f9ff] p-2 text-[#0369a1]">
              <Zap className="h-5 w-5" />
            </div>
            {totals?.payEfficiency.trend ? (
              <span className="text-xs font-semibold text-[#10b981] bg-[#e6fbf3] px-2 py-0.5 rounded-full">
                {totals.payEfficiency.trend}
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-sm font-medium text-brand-muted">Average Pay Efficiency</p>
          <p className="mt-1 text-2xl font-bold text-brand-ink">
            {isDashboardLoading ? "..." : `${totals?.payEfficiency.value ?? 100.0}%`}
          </p>
        </div>
      </div>

      {/* Main Sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Active Payruns Table */}
        <div className="lg:col-span-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-brand-navy">Active Payruns</h2>
            <button className="text-sm font-semibold text-[#0052cc] hover:underline">View All</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Pay Period</th>
                  <th className="py-3 px-4">Department/Entity</th>
                  <th className="py-3 px-4">Gross Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30 text-sm">
                {isDashboardLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                      <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-32"></div></td>
                      <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-16"></div></td>
                      <td className="py-4 px-4"><div className="h-6 bg-gray-100 rounded w-16"></div></td>
                      <td className="py-4 px-4"><div className="h-8 bg-gray-100 rounded w-24 ml-auto"></div></td>
                    </tr>
                  ))
                ) : dashboard?.activeRuns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-brand-muted">
                      No active payroll runs found. Click "New Payrun" to generate one.
                    </td>
                  </tr>
                ) : (
                  dashboard?.activeRuns.map((run) => {
                    let badgeTone: BadgeTone = "warning";
                    if (run.status === "Completed") badgeTone = "success";
                    else if (run.status === "Processing") badgeTone = "info";

                    return (
                      <tr key={`${run.id}-${run.department}`} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="py-4 px-4 font-medium text-brand-ink">
                          <div>{formatDateRange(run.startDate, run.endDate)}</div>
                          <div className="text-xs text-brand-muted mt-0.5">
                            {run.type.replace("_", " ")}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-brand-muted">{run.department}</td>
                        <td className="py-4 px-4 font-semibold text-brand-ink">
                          {run.grossTotal > 0 ? `₱${run.grossTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₱0.00"}
                        </td>
                        <td className="py-4 px-4">
                          <StatusBadge label={run.status} tone={badgeTone} />
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {run.status === "Pending" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => actionMutation.mutate({ action: "generate", periodId: run.id })}
                                disabled={actionMutation.isPending}
                                className="h-8 px-2 py-1 text-xs border-[#c3c6d2] flex items-center gap-1.5"
                                title="Generate calculation"
                              >
                                <RefreshCw className="h-3 w-3" /> Generate
                              </Button>
                            ) : null}
                            {run.status === "Processing" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => actionMutation.mutate({ action: "approve", periodId: run.id })}
                                disabled={actionMutation.isPending}
                                className="h-8 px-2 py-1 text-xs text-[#15803d] border-[#15803d]/30 bg-[#f0fdf4] hover:bg-[#dcfce7] flex items-center gap-1.5"
                                title="Approve & Lock period"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPeriodId(run.id);
                                setExportQueued(false);
                                setExportOpen(true);
                              }}
                              className="h-8 w-8 p-0"
                              title="Export period report"
                            >
                              <Download className="h-3.5 w-3.5" />
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
        </div>

        {/* Payroll Distribution Donut Chart */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-brand-navy mb-4">Payroll Distribution</h2>
            
            {isDistributionLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="text-center py-12 text-brand-muted text-sm">
                No spend data available for the current period.
              </div>
            ) : (
              <div className="relative flex justify-center items-center h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="amount"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xs text-brand-muted uppercase font-semibold">Total Spend</span>
                  <span className="text-2xl font-bold text-brand-ink">{totalSpendFormatted}</span>
                </div>
              </div>
            )}
          </div>

          {/* Chart Legend */}
          <div className="mt-6 flex flex-col gap-2.5">
            {chartData.map((dept, index) => (
              <div key={dept.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                  <span className="text-brand-ink truncate max-w-[150px]">{dept.name}</span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-xs text-brand-muted font-medium">
                    ₱{dept.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                  <span className="font-bold text-brand-ink w-8">{dept.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* New Payrun Modal */}
      <GeneratePayrollModal 
        open={newPayrunOpen} 
        onOpenChange={setNewPayrunOpen} 
        onToast={setToast} 
      />

      {/* Export Options Modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <DialogTitle>Export Payroll Report</DialogTitle>
              <DialogDescription>
                {selectedPeriodId 
                  ? "Export the selected payroll period details." 
                  : "Export organization-wide summary report across all payroll periods."}
              </DialogDescription>
            </div>
            <DialogCloseButton />
          </div>

          <div className="flex flex-col gap-5 px-6 py-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-format">Select Export Format</Label>
              <Select value={exportFormat} onValueChange={(val: any) => setExportFormat(val)}>
                <SelectTrigger id="export-format" className="w-full">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PDF">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#e11d48]" /> PDF Document (.pdf)
                    </span>
                  </SelectItem>
                  <SelectItem value="CSV">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-[#15803d]" /> CSV Spreadsheet (.csv)
                    </span>
                  </SelectItem>
                  <SelectItem value="XLSX">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-[#0369a1]" /> Excel Spreadsheet (.xlsx)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportQueued ? (
              <div className="bg-[#f0fdf4] border border-[#16a34a]/20 rounded-lg p-4 flex flex-col items-center gap-1 text-center">
                <span className="text-sm font-semibold text-[#15803d]">Export queued!</span>
                <span className="text-xs text-brand-muted">You'll get a notification with the download link once it's ready.</span>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
                Cancel
              </Button>
              {!exportQueued ? (
                <Button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-[#0052cc] hover:bg-[#004bb3] text-white"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isExporting ? "Exporting..." : "Generate Export"}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
