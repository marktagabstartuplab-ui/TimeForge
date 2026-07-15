"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Loader2,
  Search,
  Plus,
  CheckCircle2,
  Send,
  Ban,
  Landmark,
  Clock,
  FileText,
  FileSpreadsheet,
  Download,
  History,
  DollarSign,
  Users,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listPeriods,
  createPeriod,
  generateReport,
  exportPayroll,
  type PayrollPeriodType,
} from "@/features/payroll-processing/api/payroll-processing.service";
import {
  getProcessingDashboard,
  validatePayroll,
  approvePayroll,
  rejectPayroll,
  sendPayrollToBank,
  type PayrollProcessingStatus,
} from "../api/finance-payroll-processing.service";

const PROCESSING_FLOW: { status: PayrollProcessingStatus; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "VALIDATED", label: "Validated" },
  { status: "APPROVED", label: "Approved" },
  { status: "SENT_TO_BANK", label: "Sent to Bank" },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  Ready: "success",
  "Action Required": "danger",
  "Pending Approval": "warning",
};

function formatCurrency(n: number): string {
  return `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateRange(start: string, end: string): string {
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Date(start).toLocaleDateString("en-US", opt)} - ${new Date(end).toLocaleDateString("en-US", opt)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function FinancePayrollProcessingContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | string>("ALL");
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; reason: string }>({ open: false, reason: "" });
  const [newPeriod, setNewPeriod] = useState<{ type: PayrollPeriodType; startDate: string; endDate: string }>({
    type: "FIRST_HALF",
    startDate: "",
    endDate: "",
  });

  const { data: periodsPage, isLoading: isPeriodsLoading } = useQuery({
    queryKey: ["finance-payroll-processing", "periods"],
    queryFn: listPeriods,
  });
  const periods = periodsPage?.data ?? [];

  useEffect(() => {
    if (!selectedPeriodId && periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
    }
  }, [periods, selectedPeriodId]);

  const activePeriodId = selectedPeriodId;

  const { data: dashboard, isLoading: isDashLoading, isError: isDashError } = useQuery({
    queryKey: ["finance-payroll-processing", "dashboard", activePeriodId],
    queryFn: () => getProcessingDashboard(activePeriodId as string),
    enabled: Boolean(activePeriodId),
    refetchInterval: 15_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-payroll-processing"] });
  };

  const createPeriodMutation = useMutation({
    mutationFn: createPeriod,
    onSuccess: (period) => {
      setToast({ message: "Payroll period created.", tone: "success" });
      setShowCreatePeriod(false);
      setSelectedPeriodId(period.id);
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Could not create period.", tone: "error" }),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateReport(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll recalculated from the latest approved timesheets.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Recalculation failed.", tone: "error" }),
  });

  const validateMutation = useMutation({
    mutationFn: () => validatePayroll(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll validated successfully.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Validation failed.", tone: "error" }),
  });

  const approveMutation = useMutation({
    mutationFn: () => approvePayroll(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll approved.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Approval failed.", tone: "error" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectPayroll(activePeriodId as string, reason),
    onSuccess: () => {
      setToast({ message: "Payroll rejected.", tone: "success" });
      setRejectDialog({ open: false, reason: "" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Rejection failed.", tone: "error" }),
  });

  const sendToBankMutation = useMutation({
    mutationFn: () => sendPayrollToBank(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll sent to bank.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Failed to send to bank.", tone: "error" }),
  });

  const exportMutation = useMutation({
    mutationFn: (format: "PDF" | "CSV" | "XLSX") => exportPayroll({ format, periodId: activePeriodId ?? undefined }),
    onSuccess: () => setToast({ message: "Export queued — you'll get a notification with the download link.", tone: "success" }),
    onError: (err: any) => setToast({ message: err?.message || "Export failed.", tone: "error" }),
  });

  const employees = dashboard?.employees ?? [];
  const auditLog = dashboard?.auditLog ?? [];
  const processingStatus = dashboard?.processingStatus ?? "DRAFT";
  const grossPayroll = dashboard?.grossPayroll ?? 0;
  const totalEmployees = dashboard?.totalEmployees ?? 0;
  const estimatedTax = dashboard?.estimatedTax ?? 0;
  const nextDeadline = dashboard?.nextDeadline;

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (statusFilter !== "ALL" && emp.rowStatus !== statusFilter) return false;
      return true;
    });
  }, [employees, search, statusFilter]);

  const processingStepIndex = PROCESSING_FLOW.findIndex((s) => s.status === processingStatus);
  const currentStep = processingStepIndex >= 0 ? processingStepIndex : 0;
  const canValidate = processingStatus === "DRAFT";
  const canApprove = processingStatus === "VALIDATED";
  const canReject = processingStatus === "VALIDATED" || processingStatus === "PENDING_APPROVAL";
  const canSendToBank = processingStatus === "APPROVED";
  const isProcessingBusy = validateMutation.isPending || approveMutation.isPending || rejectMutation.isPending || sendToBankMutation.isPending;
  // Mirrors PayrollProcessingContent's canRecalculate guard — the backend
  // (payroll.service.ts generateReport, BR-PAY-04) rejects EXPORTED periods either way.
  const canRecalculate = dashboard?.periodStatus !== "EXPORTED";

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Payroll Processing</h1>
          <p className="text-sm text-brand-muted">Review, validate, approve, and dispatch payroll.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-muted">Payroll Period</span>
          <Select
            value={activePeriodId ?? ""}
            onValueChange={(v) => setSelectedPeriodId(v || null)}
          >
            <SelectTrigger className="h-10 min-w-[220px] rounded-[10px] border-[#c3c6d2] bg-white text-sm">
              <SelectValue placeholder={isPeriodsLoading ? "Loading periods…" : "Select a period"}>{activePeriodId && periods.length > 0 ? (() => { const p = periods.find((x) => x.id === activePeriodId); return p ? `${formatDateRange(p.startDate, p.endDate)} · ${p.status}` : undefined; })() : undefined}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatDateRange(p.startDate, p.endDate)} · {p.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowCreatePeriod((v) => !v)} className="h-10">
            <Plus className="h-4 w-4" /> New Period
          </Button>
        </div>
      </div>

      {showCreatePeriod ? (
        <SectionCard title="Create Payroll Period">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Type</label>
              <Select value={newPeriod.type} onValueChange={(v) => setNewPeriod((p) => ({ ...p, type: v as PayrollPeriodType }))}>
                <SelectTrigger className="h-10 w-40 rounded-[10px] border-[#c3c6d2] bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIRST_HALF">First Half</SelectItem>
                  <SelectItem value="SECOND_HALF">Second Half</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Start Date</label>
              <Input type="date" value={newPeriod.startDate} onChange={(e) => setNewPeriod((p) => ({ ...p, startDate: e.target.value }))} className="h-10" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">End Date</label>
              <Input type="date" value={newPeriod.endDate} onChange={(e) => setNewPeriod((p) => ({ ...p, endDate: e.target.value }))} className="h-10" />
            </div>
            <Button
              onClick={() => createPeriodMutation.mutate(newPeriod)}
              disabled={!newPeriod.startDate || !newPeriod.endDate || createPeriodMutation.isPending}
              className="h-10"
            >
              {createPeriodMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {!activePeriodId ? (
        <EmptyState message={"No payroll periods yet. Click \"New Period\" to get started."} />
      ) : isDashLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-sm">
              <Skeleton className="mb-2 h-5 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>
      ) : isDashError ? (
        <EmptyState message="Could not load payroll dashboard. Try selecting a different period." />
      ) : (
        <>
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              {PROCESSING_FLOW.map((step, idx) => {
                const isActive = idx <= currentStep;
                const isLast = idx === PROCESSING_FLOW.length - 1;
                return (
                  <div key={step.status} className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                          isActive
                            ? "bg-brand text-white"
                            : "bg-[#f6f3f4] text-brand-muted"
                        }`}
                      >
                        {isActive ? (
                          step.status === "SENT_TO_BANK" ? (
                            <Landmark className="h-4 w-4" />
                          ) : step.status === "APPROVED" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : step.status === "VALIDATED" ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            idx + 1
                          )
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span className={`text-xs font-semibold ${isActive ? "text-brand-navy" : "text-brand-muted"}`}>
                        {step.label.toUpperCase()}
                      </span>
                    </div>
                    {!isLast ? (
                      <div className={`mx-2 h-px w-12 ${idx < currentStep ? "bg-brand" : "bg-[#c3c6d2]/60"}`} />
                    ) : null}
                  </div>
                );
              })}
            </div>
            {nextDeadline ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-brand-muted">
                <Clock className="h-3.5 w-3.5" />
                Next deadline: <span className="font-semibold text-brand-navy">{nextDeadline.label}</span> —{" "}
                {formatDateTime(nextDeadline.date)}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-brand-muted">
                <DollarSign className="h-5 w-5" />
                <span className="text-sm">Gross Payroll</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-brand-ink">{formatCurrency(grossPayroll)}</p>
            </div>
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-brand-muted">
                <Users className="h-5 w-5" />
                <span className="text-sm">Total Employees</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-brand-ink">{totalEmployees}</p>
            </div>
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-brand-muted">
                <Receipt className="h-5 w-5" />
                <span className="text-sm">Estimated Tax (15%)</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-brand-ink">{formatCurrency(estimatedTax)}</p>
            </div>
          </div>

          <SectionCard
            title="Payroll Table"
            action={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
                  <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48 pl-8 text-xs" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "ALL")}>
                  <SelectTrigger className="h-9 w-40 rounded-[8px] border-[#c3c6d2] bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="Ready">Ready</SelectItem>
                    <SelectItem value="Action Required">Action Required</SelectItem>
                    <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={!canRecalculate || generateMutation.isPending} className="h-9 text-xs">
                  <RefreshCw className={`h-3.5 w-3.5 ${generateMutation.isPending ? "animate-spin" : ""}`} /> Recalculate
                </Button>
              </div>
            }
          >
            {filteredEmployees.length === 0 ? (
              <EmptyState message={employees.length === 0 ? "No employees match payroll eligibility. Generate a report first." : "No employees match this filter."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Hourly Rate</th>
                      <th className="py-3 px-4">Gross Payroll</th>
                      <th className="py-3 px-4">Pay Multiplier</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-brand-navy">
                            {emp.firstName} {emp.lastName}
                          </div>
                          <div className="text-xs text-brand-muted">{emp.jobTitle ?? emp.employmentType}</div>
                        </td>
                        <td className="py-3 px-4 text-brand-ink">{emp.department?.name ?? "—"}</td>
                        <td className="py-3 px-4 text-brand-ink">{formatCurrency(emp.hourlyRate)}/hr</td>
                        <td className="py-3 px-4 font-semibold text-brand-ink">{formatCurrency(emp.estimatedPay)}</td>
                        <td className="py-3 px-4 text-brand-ink">{emp.payMultiplier.toFixed(2)}x</td>
                        <td className="py-3 px-4">
                          <StatusBadge label={emp.rowStatus} tone={STATUS_TONE[emp.rowStatus] ?? "neutral"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <SectionCard title="Processing Panel" className="lg:col-span-1">
              <div className="flex flex-col gap-3">
                <div className="text-xs text-brand-muted">
                  Current status: <span className="font-semibold text-brand-navy">{processingStatus.replace(/_/g, " ")}</span>
                </div>

                <Button
                  onClick={() => validateMutation.mutate()}
                  disabled={!canValidate || isProcessingBusy || validateMutation.isPending}
                  className="w-full justify-start"
                  variant="outline"
                >
                  {validateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Validate Payroll
                </Button>

                <Button
                  onClick={() => approveMutation.mutate()}
                  disabled={!canApprove || isProcessingBusy || approveMutation.isPending}
                  className="w-full justify-start"
                  variant="outline"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Approve Payroll
                </Button>

                <Button
                  onClick={() => setRejectDialog({ open: true, reason: "" })}
                  disabled={!canReject || isProcessingBusy}
                  className="w-full justify-start border-red-200 bg-red-50/50 text-red-600 hover:bg-red-50"
                  variant="outline"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Reject Payroll
                </Button>

                <Button
                  onClick={() => sendToBankMutation.mutate()}
                  disabled={!canSendToBank || isProcessingBusy || sendToBankMutation.isPending}
                  className="w-full justify-start"
                  variant="outline"
                >
                  {sendToBankMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Landmark className="mr-2 h-4 w-4" />
                  )}
                  Send Payroll to Bank
                </Button>

                <div className="mt-2 border-t border-[#c3c6d2]/30 pt-3">
                  <p className="mb-2 text-xs font-semibold text-brand-muted">Export</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("PDF")} disabled={exportMutation.isPending} className="flex-1 text-xs">
                      <FileText className="mr-1 h-3.5 w-3.5" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("XLSX")} disabled={exportMutation.isPending} className="flex-1 text-xs">
                      <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("CSV")} disabled={exportMutation.isPending} className="flex-1 text-xs">
                      <Download className="mr-1 h-3.5 w-3.5" /> CSV
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Audit Log" className="lg:col-span-2">
              {auditLog.length === 0 ? (
                <EmptyState message="No audit entries yet. Actions will be logged here." />
              ) : (
                <div className="flex flex-col gap-1">
                  {auditLog.map((entry) => {
                    const actionLabel = entry.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-[8px] p-2.5 transition-colors hover:bg-[#f6f3f4]"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f6f3f4] text-brand-muted">
                          <History className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-brand-navy">{actionLabel}</p>
                          <p className="text-xs text-brand-muted">
                            by {entry.actorName ?? "System"} · {formatDateTime(entry.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}

      {rejectDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-[16px] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-brand-navy">Reject Payroll</h3>
            <p className="mt-1 text-sm text-brand-muted">Provide a reason for rejecting this payroll period.</p>
            <textarea
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog((d) => ({ ...d, reason: e.target.value }))}
              placeholder="Reason for rejection…"
              rows={4}
              className="mt-4 w-full rounded-[10px] border border-[#c3c6d2] p-3 text-sm outline-none focus:border-brand"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRejectDialog({ open: false, reason: "" })}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => rejectMutation.mutate(rejectDialog.reason)}
                disabled={!rejectDialog.reason.trim() || rejectMutation.isPending}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {rejectMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />}
                Reject
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
