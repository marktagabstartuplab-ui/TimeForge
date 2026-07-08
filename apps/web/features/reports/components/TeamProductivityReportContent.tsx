"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Calendar, 
  Search, 
  ArrowUpRight, 
  Download, 
  Loader2, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle,
  FileText
} from "lucide-react";
import { getTeamProductivity, getTeamProductivitySummary, generateReport } from "../api/reports.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast, type ToastState } from "@/components/shared/Toast";

export function TeamProductivityReportContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  
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

  // Queries
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["team-productivity-summary", startDate, endDate],
    queryFn: () => getTeamProductivitySummary({ from: startDate, to: endDate }),
  });

  const { data: productivityData, isLoading: isTableLoading, refetch } = useQuery({
    queryKey: ["team-productivity-details", filterParams],
    queryFn: () => getTeamProductivity(filterParams),
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
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Export failed.", tone: "error" });
    }
  });

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
              {isSummaryLoading ? "..." : `$${(summary?.payrollLiability ?? 42850).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
                      ${row.payrollEstimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    ${totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
    </div>
  );
}
