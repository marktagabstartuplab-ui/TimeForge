"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Save,
  Send,
  Flag,
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  Search,
  AlertTriangle,
  Plus,
  Sparkles,
  X,
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
  getReportByPeriod,
  generateReport,
  lockPeriod,
  unlockPeriod,
  flagDiscrepancies,
  exportPayroll,
  mostRecentlyUpdatedPeriod,
  type PayrollPeriodType,
} from "../api/payroll-processing.service";
import { runAndPollAiJob } from "@/features/scrum-management/api/ai-insight.service";
import { AiFormattedText } from "@/components/shared/AiFormattedText";

const WIZARD_STEPS = [
  { n: 1, key: "period", label: "Period" },
  { n: 2, key: "sheets", label: "Sheets" },
  { n: 3, key: "hours", label: "Hours" },
  { n: 4, key: "calc", label: "Calc" },
  { n: 5, key: "rate", label: "Rate" },
  { n: 6, key: "sum", label: "Sum" },
  { n: 7, key: "valid", label: "Valid" },
] as const;

type RowStatus = "Validated" | "Pending" | "Discrepancy";
const ROW_STATUS_TONE: Record<RowStatus, BadgeTone> = { Validated: "neutral", Pending: "warning", Discrepancy: "danger" };

function rowStatus(approvedHours: number, rejectedHours: number): RowStatus {
  if (rejectedHours > 0) return "Discrepancy";
  if (approvedHours > 0) return "Validated";
  return "Pending";
}

function formatCurrency(n: number): string {
  return `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateRange(start: string, end: string): string {
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Date(start).toLocaleDateString("en-US", opt)} - ${new Date(end).toLocaleDateString("en-US", opt)}`;
}

export function PayrollProcessingContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | RowStatus>("ALL");
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState<{ type: PayrollPeriodType; startDate: string; endDate: string }>({
    type: "FIRST_HALF",
    startDate: "",
    endDate: "",
  });

  const { data: periodsPage, isLoading: isPeriodsLoading } = useQuery({
    queryKey: ["payroll-processing", "periods"],
    queryFn: listPeriods,
  });
  const periods = periodsPage?.data ?? [];

  useEffect(() => {
    if (!selectedPeriodId && periods.length > 0) {
      setSelectedPeriodId((mostRecentlyUpdatedPeriod(periods) ?? periods[0]).id);
    }
  }, [periods, selectedPeriodId]);

  const activePeriodId = selectedPeriodId;
  const activePeriod = periods.find((p) => p.id === activePeriodId) ?? null;

  const { data: report, isLoading: isReportLoading, isError: isReportError } = useQuery({
    queryKey: ["payroll-processing", "report", activePeriodId],
    queryFn: () => getReportByPeriod(activePeriodId as string),
    enabled: Boolean(activePeriodId),
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-processing"] });
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

  const lockMutation = useMutation({
    mutationFn: () => lockPeriod(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll sent to Finance and locked for edits.", tone: "success" });
      setStep(7);
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Could not send to Finance.", tone: "error" }),
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockPeriod(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll period unlocked to OPEN status for editing/testing.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Could not unlock period.", tone: "error" }),
  });

  const flagMutation = useMutation({
    mutationFn: () => flagDiscrepancies(report!.id),
    onSuccess: (res) => {
      setToast({
        message: res.flaggedCount > 0 ? `Flagged ${res.flaggedCount} discrepant record${res.flaggedCount === 1 ? "" : "s"} for follow-up.` : "No discrepancies to flag.",
        tone: res.flaggedCount > 0 ? "success" : "info",
      });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Could not flag discrepancies.", tone: "error" }),
  });

  const exportMutation = useMutation({
    mutationFn: (format: "PDF" | "CSV" | "XLSX") => exportPayroll({ format, periodId: activePeriodId ?? undefined }),
    onSuccess: () => setToast({ message: "Export queued — you'll get a notification with the download link.", tone: "success" }),
    onError: (err: any) => setToast({ message: err?.message || "Export failed.", tone: "error" }),
  });

  const handleSaveDraft = () => {
    setToast({ message: "Draft saved — figures reflect the latest calculation.", tone: "success" });
  };

  // PAYROLL_VALIDATION pre-lock sanity check: locking is irreversible (a
  // locked period can't be regenerated), so surface AI anomaly findings
  // BEFORE Send to Finance rather than after.
  const [aiChecking, setAiChecking] = useState(false);
  const [aiCheck, setAiCheck] = useState<{ summary: string; recommendation: string } | null>(null);

  const handleAiCheck = async () => {
    if (!activePeriodId) return;
    setAiChecking(true);
    try {
      const result = await runAndPollAiJob("PAYROLL_VALIDATION", "payroll_period", activePeriodId);
      setAiCheck({ summary: result.summary, recommendation: result.recommendation });
    } catch (err: any) {
      setToast({ message: err?.message || "AI check failed.", tone: "error" });
    } finally {
      setAiChecking(false);
    }
  };

  const lineItems = report?.lineItems ?? [];
  const totals = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    let pay = 0;
    for (const li of lineItems) {
      approved += Number(li.approvedHours);
      pending += Number(li.pendingHours);
      rejected += Number(li.rejectedHours);
      pay += Number(li.estimatedPay);
    }
    const totalHours = approved + pending + rejected;
    const approvedPct = totalHours > 0 ? Math.round((approved / totalHours) * 100) : 0;
    const flaggedCount = lineItems.filter((li) => Number(li.rejectedHours) > 0).length;
    return { approved, pending, rejected, pay, approvedPct, flaggedCount };
  }, [lineItems]);

  const filteredRows = useMemo(() => {
    return lineItems.filter((li) => {
      const name = `${li.user.firstName} ${li.user.lastName}`.toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      const status = rowStatus(Number(li.approvedHours), Number(li.rejectedHours));
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      return true;
    });
  }, [lineItems, search, statusFilter]);

  const canRecalculate = Boolean(activePeriodId) && activePeriod?.status !== "EXPORTED";
  const canSendToFinance = report && activePeriod?.status === "GENERATED";
  const isBusy = generateMutation.isPending || lockMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Payroll Processing</h1>
          <p className="text-sm text-brand-muted">Review, calculate, and finalize workforce payments.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-muted">Select Payroll Period</span>
          <Select
            value={activePeriodId ?? ""}
            onValueChange={(v) => {
              setSelectedPeriodId(v || null);
              setStep(1);
            }}
          >
            <SelectTrigger className="h-10 min-w-[220px] rounded-[10px] border-[#c3c6d2] bg-white text-sm">
              <SelectValue placeholder={isPeriodsLoading ? "Loading periods…" : "Select a period"}>{activePeriod ? `${formatDateRange(activePeriod.startDate, activePeriod.endDate)} · ${activePeriod.status}` : undefined}</SelectValue>
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

      {/* Wizard stepper */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-[12px] border border-[#c3c6d2]/50 bg-white p-2">
        {WIZARD_STEPS.map((s, idx) => (
          <div key={s.key} className="flex items-center">
            <button
              type="button"
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-xs font-bold transition-colors ${
                step === s.n ? "bg-brand text-white" : "text-brand-muted hover:bg-[#f6f3f4]"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  step === s.n ? "bg-white/20" : "bg-[#e4e2e3] text-brand-muted"
                }`}
              >
                {String(s.n).padStart(2, "0")}
              </span>
              {s.label.toUpperCase()}
            </button>
            {idx < WIZARD_STEPS.length - 1 ? <span className="mx-1 h-px w-4 bg-[#c3c6d2]/60" /> : null}
          </div>
        ))}
      </div>

      {!activePeriodId ? (
        <EmptyState message="No payroll periods yet. Click “New Period” to get started." />
      ) : (
        <>
          {/* Contextual step panel */}
          {step === 1 ? (
            <SectionCard title="Payroll Period">
              <p className="text-sm text-brand-ink">
                {activePeriod ? `${formatDateRange(activePeriod.startDate, activePeriod.endDate)} — status: ${activePeriod.status}` : "Select a period above."}
              </p>
            </SectionCard>
          ) : null}

          {step === 2 ? (
            <SectionCard title="Timesheet Validation">
              <p className="text-sm text-brand-muted">
                {report
                  ? `${totals.approvedPct}% of submitted hours are approved and payroll-ready for this period.`
                  : "No report generated yet — click Recalculate to pull in approved timesheets."}
              </p>
            </SectionCard>
          ) : null}

          {step === 3 ? (
            <SectionCard title="Hours Review">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[#c3c6d2]/40 p-3">
                  <div className="text-xs font-semibold text-brand-muted">Approved</div>
                  <div className="text-lg font-bold text-brand-ink">{totals.approved.toFixed(1)}h</div>
                </div>
                <div className="rounded-lg border border-[#c3c6d2]/40 p-3">
                  <div className="text-xs font-semibold text-brand-muted">Pending</div>
                  <div className="text-lg font-bold text-brand-ink">{totals.pending.toFixed(1)}h</div>
                </div>
                <div className="rounded-lg border border-[#c3c6d2]/40 p-3">
                  <div className="text-xs font-semibold text-brand-muted">Rejected</div>
                  <div className="text-lg font-bold text-brand-ink">{totals.rejected.toFixed(1)}h</div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {step === 4 ? (
            <SectionCard title="Payroll Calculation">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-brand-muted">
                  Recalculate to regenerate hours and pay from the current state of approved timesheets. Safe to re-run — it always reflects live data.
                </p>
                <Button onClick={() => generateMutation.mutate()} disabled={!canRecalculate || isBusy} className="shrink-0">
                  {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Recalculate
                </Button>
              </div>
            </SectionCard>
          ) : null}

          {step === 5 ? (
            <SectionCard title="Rate Verification">
              {lineItems.length === 0 ? (
                <EmptyState message="No line items to verify yet." />
              ) : (
                <ul className="flex flex-col divide-y divide-[#c3c6d2]/30">
                  {lineItems.map((li) => (
                    <li key={li.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium text-brand-ink">
                        {li.user.firstName} {li.user.lastName}
                      </span>
                      <span className="text-brand-muted">₱{Number(li.hourlyRate).toFixed(2)}/hr</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {step === 7 ? (
            <SectionCard title="Final Validation">
              <p className="text-sm text-brand-ink">
                {activePeriod?.status === "LOCKED" || activePeriod?.status === "EXPORTED"
                  ? "This payroll period is locked and has been sent to Finance."
                  : "Send to Finance once the summary below looks correct — this locks the period from further edits."}
              </p>
            </SectionCard>
          ) : null}

          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
              <p className="text-sm text-brand-muted">Approved Hours</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-brand-ink">{isReportLoading ? "…" : totals.approved.toFixed(1)}</span>
                {report ? <StatusBadge label={`${totals.approvedPct}% of Total`} tone="neutral" /> : null}
              </div>
            </div>
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
              <p className="text-sm text-brand-muted">Pending Hours</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-brand-ink">{isReportLoading ? "…" : totals.pending.toFixed(1)}</span>
                {totals.pending > 0 ? <StatusBadge label="Requires Attention" tone="warning" /> : null}
              </div>
            </div>
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-sm">
              <p className="text-sm text-brand-muted">Rejected Hours</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-brand-ink">{isReportLoading ? "…" : totals.rejected.toFixed(1)}</span>
                {totals.flaggedCount > 0 ? <StatusBadge label="Flagged Discrepancies" tone="danger" /> : null}
              </div>
            </div>
            <div className="rounded-[16px] bg-brand p-5 text-white shadow-sm">
              <p className="text-sm text-white/80">Estimated Payroll Summary</p>
              <div className="mt-1 text-2xl font-bold">{isReportLoading ? "…" : formatCurrency(totals.pay)}</div>
            </div>
          </div>

          {/* Sync hint: report exists but no approved hours were captured */}
          {report && totals.approved === 0 && activePeriod?.status !== "EXPORTED" && (
            <div className="flex items-start gap-3 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">No approved hours found in this period</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  If timesheets were recently approved by a supervisor, click <strong>Recalculate All</strong> to sync the latest data into the payroll table.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={!canRecalculate || isBusy}
                className="shrink-0 border-amber-300 bg-white text-xs text-amber-700 hover:bg-amber-50"
              >
                {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Recalculate
              </Button>
            </div>
          )}

          {/* Employee table */}
          <SectionCard
            title="Employee Payroll Table"
            action={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
                  <Input placeholder="Filter by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48 pl-8 text-xs" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="h-9 w-36 rounded-[8px] border-[#c3c6d2] bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="Validated">Validated</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Discrepancy">Discrepancy</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={!canRecalculate || isBusy} className="h-9 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Recalculate All
                </Button>
              </div>
            }
          >
            {isReportLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : isReportError ? (
              <EmptyState message="Couldn't load the payroll report." />
            ) : filteredRows.length === 0 ? (
              <EmptyState message={report ? "No employees match this filter." : "No report generated yet — click Recalculate to compute payroll from approved timesheets."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Approved Hours</th>
                      <th className="py-3 px-4">Overtime</th>
                      <th className="py-3 px-4">Rate</th>
                      <th className="py-3 px-4">Gross Pay</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {filteredRows.map((li) => {
                      const status = rowStatus(Number(li.approvedHours), Number(li.rejectedHours));
                      return (
                        <tr key={li.id} className={status === "Discrepancy" ? "bg-red-50/40" : "hover:bg-gray-50/50 transition-colors"}>
                          <td className="py-3 px-4">
                            <div className={`font-semibold ${status === "Discrepancy" ? "text-red-700" : "text-brand-navy"}`}>
                              {li.user.firstName} {li.user.lastName}
                            </div>
                            <div className="text-xs text-brand-muted">{li.user.jobTitle ?? li.user.department?.name ?? li.user.employmentType}</div>
                          </td>
                          <td className="py-3 px-4 text-brand-ink">{Number(li.approvedHours).toFixed(2)}</td>
                          <td className="py-3 px-4 text-brand-ink">{Number(li.overtimeHours).toFixed(1)}</td>
                          <td className="py-3 px-4 text-brand-ink">₱{Number(li.hourlyRate).toFixed(2)}/hr</td>
                          <td className="py-3 px-4 font-semibold text-brand-ink">{formatCurrency(Number(li.estimatedPay))}</td>
                          <td className="py-3 px-4">
                            <StatusBadge label={status} tone={ROW_STATUS_TONE[status]} />
                          </td>
                          <td className="py-3 px-4">
                            {status === "Discrepancy" ? <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Discrepancy" /> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("PDF")} disabled={exportMutation.isPending} className="text-xs">
                <FileText className="h-3.5 w-3.5" /> Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("XLSX")} disabled={exportMutation.isPending} className="text-xs">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportMutation.mutate("CSV")} disabled={exportMutation.isPending} className="text-xs">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => flagMutation.mutate()}
                disabled={!report || flagMutation.isPending}
                className="border-red-200 bg-red-50/50 text-xs text-red-600 hover:bg-red-50"
              >
                <Flag className="h-3.5 w-3.5" /> Flag Discrepancy
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiCheck}
                disabled={!report || aiChecking}
                title="AI anomaly scan of this period's line items — run before locking"
                className="text-xs text-brand"
              >
                {aiChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiChecking ? "Checking..." : "Run AI Check"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={!report} className="text-xs">
                <Save className="h-3.5 w-3.5" /> Save Draft
              </Button>
              {activePeriod?.status === "LOCKED" || activePeriod?.status === "GENERATED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unlockMutation.mutate()}
                  disabled={unlockMutation.isPending}
                  className="border-amber-300 bg-amber-50 text-xs text-amber-700 hover:bg-amber-100"
                >
                  {unlockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                  Unlock Period
                </Button>
              ) : null}
              <Button size="sm" onClick={() => lockMutation.mutate()} disabled={!canSendToFinance || isBusy} className="text-xs">
                {lockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send to Finance
              </Button>
            </div>
          </div>

          {aiCheck ? (
            <div className="rounded-[12px] border border-brand/25 bg-brand-cyan/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2 text-sm text-brand-ink">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
                    <Sparkles className="h-3.5 w-3.5" /> AI Payroll Check
                  </p>
                  <AiFormattedText text={aiCheck.summary} className="leading-relaxed" />
                  <AiFormattedText text={aiCheck.recommendation} className="leading-relaxed text-brand-muted" />
                </div>
                <button
                  type="button"
                  onClick={() => setAiCheck(null)}
                  className="shrink-0 text-brand-muted hover:text-brand-navy"
                  aria-label="Dismiss AI check result"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
