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
  Users,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PesoIcon } from "@/components/shared/PesoIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listPeriods,
  createPeriod,
  generateReport,
  exportPayroll,
  mostRecentlyUpdatedPeriod,
  lockPeriod,
} from "@/features/payroll-processing/api/payroll-processing.service";
import {
  getProcessingDashboard,
  validatePayroll,
  approvePayroll,
  rejectPayroll,
  sendPayrollToBank,
  updateUserRate,
  type PayrollProcessingStatus,
  type PayrollEmployee,
} from "../api/finance-payroll-processing.service";
import { listTimesheets, type Timesheet } from "@/features/timesheets/api/timesheets.service";
import { TimesheetWorkDetails } from "@/features/timesheets/components/TimesheetWorkDetails";
import { timesheetStatusTone } from "@/components/shared/StatusBadge";
import { useCan } from "@/features/auth/rbac";

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

/**
 * Finance drill-down: the employee's approved work details for the payroll
 * period — the same entries the supervisor reviewed, fetched through the
 * existing timesheet endpoints (Finance holds timesheet:read_org; RBAC is
 * enforced server-side). Read-only; payroll actions stay unchanged.
 */
function EmployeeWorkDetailsModal({
  employee,
  periodStart,
  periodEnd,
  onClose,
}: {
  employee: PayrollEmployee;
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["finance-payroll-processing", "employee-timesheets", employee.id, periodStart, periodEnd],
    queryFn: () =>
      listTimesheets({
        userId: employee.id,
        from: periodStart.slice(0, 10),
        to: periodEnd.slice(0, 10),
        limit: 20,
      }),
  });
  const sheets: Timesheet[] = data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[16px] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-brand-navy">
              Work Details — {employee.firstName} {employee.lastName}
            </h3>
            <p className="text-xs text-brand-muted">
              {formatDateRange(periodStart, periodEnd)} · {employee.department?.name ?? "No department"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-brand-muted hover:text-brand-navy">
            &times;
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : sheets.length === 0 ? (
          <EmptyState message="No timesheets found for this employee in the selected payroll period." />
        ) : (
          <div className="flex flex-col gap-5">
            {sheets.map((sheet) => (
              <div key={sheet.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand-navy">
                    {formatDateRange(sheet.periodStart, sheet.periodEnd)}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-muted">
                      {(sheet.totalMinutes / 60).toFixed(2)} hrs
                    </span>
                    <StatusBadge {...timesheetStatusTone(sheet.status)} />
                  </div>
                </div>
                <TimesheetWorkDetails timesheetId={sheet.id} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export function FinancePayrollProcessingContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | string>("ALL");
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; reason: string }>({ open: false, reason: "" });
  // BUG-BK: per-employee selection for individual/batch payroll processing. The
  // table and "Process Selected" button below were added without this state, so
  // the file only compiled while its JSX was unparseable.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [newPeriod, setNewPeriod] = useState<{ type: "CUSTOM"; startDate: string; endDate: string; name: string }>({
    type: "CUSTOM",
    startDate: "",
    endDate: "",
    // BUG-BJ: custom period display name — the input was wired to newPeriod.name
    // without the field existing on the state.
    name: "",
  });

  const { data: periodsPage, isLoading: isPeriodsLoading } = useQuery({
    queryKey: ["finance-payroll-processing", "periods"],
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
  const [workDetailsEmp, setWorkDetailsEmp] = useState<PayrollEmployee | null>(null);

  // Inline base-rate editing (Finance/Admin only). `rateEdit` holds the row
  // being edited: the user id, the version for optimistic concurrency, and the
  // draft input value.
  const canEditRate = useCan("payroll_rate:update");
  // BUG-AT: off-cycle payrolls (final pay, mid-month adjustments) need a period
  // the scheduler never generated, so Finance can create one inline.
  const canCreatePeriod = useCan("payroll_period:create");
  const [rateEdit, setRateEdit] = useState<{ userId: string; version: number; value: string } | null>(null);

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
      setNewPeriod({ type: "CUSTOM", startDate: "", endDate: "", name: "" });
      setSelectedPeriodId(period.id);
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Could not create period.", tone: "error" }),
  });

  const generateMutation = useMutation({
    mutationFn: (options?: { employeeIds?: string[]; timesheetIds?: string[] }) =>
      generateReport(activePeriodId as string, options),
    onSuccess: () => {
      setToast({ message: "Payroll recalculated from the latest approved timesheets.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Recalculation failed.", tone: "error" }),
  });

  const lockMutation = useMutation({
    mutationFn: () => lockPeriod(activePeriodId as string),
    onSuccess: () => {
      setToast({ message: "Payroll period locked.", tone: "success" });
      invalidateAll();
    },
    onError: (err: any) => setToast({ message: err?.message || "Locking failed.", tone: "error" }),
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

  const rateMutation = useMutation({
    mutationFn: ({ userId, rate, version }: { userId: string; rate: number; version: number }) =>
      updateUserRate(userId, rate, version),
    onSuccess: () => {
      setRateEdit(null);
      setToast({
        message: "Base rate updated. Regenerate the report to apply it to this period's payout.",
        tone: "success",
      });
      invalidateAll();
    },
    onError: (err: any) =>
      setToast({ message: err?.message || "Could not update the rate. Refresh and try again.", tone: "error" }),
  });

  const submitRate = () => {
    if (!rateEdit) return;
    const parsed = Number(rateEdit.value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setToast({ message: "Enter a valid rate of ₱0 or more.", tone: "error" });
      return;
    }
    rateMutation.mutate({ userId: rateEdit.userId, rate: parsed, version: rateEdit.version });
  };

  const employees = dashboard?.employees ?? [];
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

  // Mirrors the server-side guard in payroll.service.ts createPeriod: both dates
  // required, end must not precede start.
  const newPeriodError =
    newPeriod.startDate && newPeriod.endDate && newPeriod.endDate < newPeriod.startDate
      ? "End date must be on or after the start date."
      : null;
  const canSubmitNewPeriod = Boolean(newPeriod.startDate && newPeriod.endDate) && !newPeriodError;

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
            <SelectTrigger className="h-10 min-w-[240px] rounded-[10px] border-[#c3c6d2] bg-white text-sm">
              <SelectValue placeholder={isPeriodsLoading ? "Loading periods…" : "Select a period"}>
                {activePeriodId && periods.length > 0
                  ? (() => {
                      const p = periods.find((x) => x.id === activePeriodId);
                      return p ? `${p.name ? `${p.name} (${formatDateRange(p.startDate, p.endDate)})` : formatDateRange(p.startDate, p.endDate)} · ${p.status}` : undefined;
                    })()
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            {/* Same fix as the HR screen: the popup defaults to the trigger's
                width with overflow-x hidden, clipping these "range · STATUS ·
                Custom" labels mid-word, and aligns the selected item over the
                trigger, floating a 13-item list up across the page header. */}
            <SelectContent
              align="end"
              alignItemWithTrigger={false}
              className="w-auto max-w-[min(28rem,calc(100vw-2rem))] min-w-(--anchor-width)"
            >
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id} className="whitespace-nowrap">
                  {p.name ? `${p.name} (${formatDateRange(p.startDate, p.endDate)})` : formatDateRange(p.startDate, p.endDate)} · {p.status}
                  {p.isAutoGenerated ? "" : " · Custom"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreatePeriod ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowCreatePeriod(true)}
              className="h-10 shrink-0"
            >
              <Plus className="mr-1 h-4 w-4" /> Add Custom Period
            </Button>
          ) : null}
          {activePeriod && activePeriod.status !== "LOCKED" && activePeriod.status !== "EXPORTED" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => lockMutation.mutate()}
              disabled={lockMutation.isPending}
              className="h-10 shrink-0 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              {lockMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Lock Period
            </Button>
          ) : null}
        </div>
      </div>

      {!activePeriodId ? (
        <EmptyState message="No payroll periods available." />
      ) : isDashLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-sm">
              <Skeleton className="mb-2 h-5 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>
      ) : /*
           Whether HR has handed the period over is PayrollPeriod.status
           (OPEN -> GENERATED -> LOCKED -> EXPORTED). processingStatus is
           Finance's own pipeline (DRAFT -> VALIDATED -> APPROVED ->
           SENT_TO_BANK), and gating on `processingStatus === "DRAFT"` made this
           screen unusable: DRAFT is exactly the state Finance validates from
           (canValidate below), so the Validate button only ever rendered on a
           screen that only appeared when it was disabled. HR locking a period
           left it LOCKED/DRAFT and Finance saw "Pending HR Submission" forever.

           Pending means HR is still working: the period is OPEN, or GENERATED
           and untouched by Finance. A locked/exported period, or one Finance has
           already progressed, opens the workspace.
        */
      activePeriod?.status === "OPEN" ||
        (activePeriod?.status === "GENERATED" && processingStatus === "DRAFT") ||
        isDashError ? (
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-12 text-center shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Clock className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-bold text-brand-navy">Pending HR Submission</h3>
          <p className="max-w-md text-sm text-brand-muted">
            HR is currently reviewing and auditing timesheets for this period. Payroll processing and calculations will be unlocked once HR submits the finalized report to Finance.
          </p>
          <div className="mt-2 inline-flex items-center rounded-full bg-amber-100/60 px-3.5 py-1.5 text-xs font-semibold text-amber-800">
            Status: Pending HR Submission — HR is currently reviewing
          </div>
        </div>
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
                <PesoIcon className="h-5 w-5" />
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
                <PesoIcon className="h-5 w-5" />
                <span className="text-sm">Tax Withheld</span>
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
                {selectedUserIds.length > 0 ? (
                  <Button
                    size="sm"
                    onClick={() => generateMutation.mutate({ employeeIds: selectedUserIds })}
                    disabled={!canRecalculate || generateMutation.isPending}
                    className="h-9 bg-brand text-xs font-bold text-white hover:bg-[#1467d6]"
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Process Selected ({selectedUserIds.length})
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => generateMutation.mutate(undefined)} disabled={!canRecalculate || generateMutation.isPending} className="h-9 text-xs">
                  <RefreshCw className={`h-3.5 w-3.5 ${generateMutation.isPending ? "animate-spin" : ""}`} /> Recalculate All
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
                      <th className="py-3 px-4 w-10 text-center">
                        <Checkbox
                          checked={filteredEmployees.length > 0 && selectedUserIds.length === filteredEmployees.length}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedUserIds(filteredEmployees.map((e) => e.id));
                            } else {
                              setSelectedUserIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Hourly Rate</th>
                      <th className="py-3 px-4">Base Pay</th>
                      <th className="py-3 px-4">Premiums</th>
                      <th className="py-3 px-4">Gross Payroll</th>
                      {/* Base pay ÷ (hours × rate) — describes the base rate
                          uplift only, so it deliberately excludes premiums. */}
                      <th className="py-3 px-4">Pay Multiplier</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {filteredEmployees.map((emp) => {
                      const isChecked = selectedUserIds.includes(emp.id);
                      return (
                        <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 px-4 text-center">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  setSelectedUserIds((prev) => [...prev, emp.id]);
                                } else {
                                  setSelectedUserIds((prev) => prev.filter((id) => id !== emp.id));
                                }
                              }}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-brand-navy">
                              {emp.firstName} {emp.lastName}
                            </div>
                            <div className="text-xs text-brand-muted">{emp.jobTitle ?? emp.employmentType}</div>
                          </td>
                        <td className="py-3 px-4 text-brand-ink">{emp.department?.name ?? "—"}</td>
                        <td className="py-3 px-4 text-brand-ink">
                          {rateEdit?.userId === emp.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-brand-muted">₱</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                autoFocus
                                value={rateEdit.value}
                                onChange={(e) => setRateEdit({ ...rateEdit, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitRate();
                                  if (e.key === "Escape") setRateEdit(null);
                                }}
                                className="h-8 w-24"
                                aria-label={`Hourly rate for ${emp.firstName} ${emp.lastName}`}
                              />
                              <Button type="button" size="xs" onClick={submitRate} disabled={rateMutation.isPending}>
                                {rateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => setRateEdit(null)}
                                disabled={rateMutation.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>
                                {emp.userHourlyRate != null ? `${formatCurrency(emp.userHourlyRate)}/hr` : "Not set"}
                              </span>
                              {canEditRate ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRateEdit({
                                      userId: emp.id,
                                      version: emp.userVersion,
                                      value: emp.userHourlyRate != null ? String(emp.userHourlyRate) : "",
                                    })
                                  }
                                  className="text-brand-muted hover:text-brand"
                                  aria-label={`Edit rate for ${emp.firstName} ${emp.lastName}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                        {/* Base + Premiums = Gross Payroll. Showing only base pay
                            here (the old "Gross Payroll" column) made net pay look
                            larger than gross whenever an employee earned premiums. */}
                        <td className="py-3 px-4 text-brand-ink">{formatCurrency(emp.basePay)}</td>
                        <td className="py-3 px-4 text-brand-ink">
                          {(() => {
                            const premiums =
                              emp.holidayPay + emp.nightDifferential + emp.restDayPay + emp.deMinimisTotal;
                            if (premiums === 0) return <span className="text-brand-muted">—</span>;
                            const parts = [
                              emp.holidayPay > 0 ? `Holiday ${formatCurrency(emp.holidayPay)}` : null,
                              emp.nightDifferential > 0 ? `Night diff ${formatCurrency(emp.nightDifferential)}` : null,
                              emp.restDayPay > 0 ? `Rest day ${formatCurrency(emp.restDayPay)}` : null,
                              emp.deMinimisTotal > 0 ? `De minimis ${formatCurrency(emp.deMinimisTotal)}` : null,
                            ].filter(Boolean);
                            return (
                              <span title={parts.join(" · ")} className="cursor-help underline decoration-dotted">
                                {formatCurrency(premiums)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-brand-ink">{formatCurrency(emp.grossTotal)}</td>
                        <td className="py-3 px-4 text-brand-ink">{emp.payMultiplier.toFixed(2)}x</td>
                        <td className="py-3 px-4">
                          <StatusBadge label={emp.rowStatus} tone={STATUS_TONE[emp.rowStatus] ?? "neutral"} />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Processing Panel">
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
        </>
      )}

      {showCreatePeriod ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-[16px] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-brand-navy">Create Payroll Period</h3>
            <p className="mt-1 text-sm text-brand-muted">
              Set up an off-cycle or custom-range period. It becomes available in the period
              selector immediately.
            </p>

            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label htmlFor="finance-new-period-name" className="mb-1 block text-xs font-semibold text-brand-muted">
                  Period Name (Optional)
                </label>
                <Input
                  id="finance-new-period-name"
                  type="text"
                  placeholder="e.g. Mid-Year Bonus Period, Final Pay"
                  value={newPeriod.name}
                  onChange={(e) => setNewPeriod((p) => ({ ...p, name: e.target.value }))}
                  className="h-10 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-brand-muted">Period Type</label>
                <div className="flex h-10 items-center rounded-[10px] border border-[#c3c6d2] bg-[#f6f3f4] px-3 text-sm text-brand-ink">
                  Custom (off-cycle)
                </div>
                <p className="mt-1 text-xs text-brand-muted">
                  Semi-monthly periods (1st–15th, 16th–end of month) are generated automatically.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-period-start" className="mb-1 block text-xs font-semibold text-brand-muted">
                    Start Date
                  </label>
                  <Input
                    id="new-period-start"
                    type="date"
                    value={newPeriod.startDate}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, startDate: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div>
                  <label htmlFor="new-period-end" className="mb-1 block text-xs font-semibold text-brand-muted">
                    End Date
                  </label>
                  <Input
                    id="new-period-end"
                    type="date"
                    min={newPeriod.startDate || undefined}
                    value={newPeriod.endDate}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, endDate: e.target.value }))}
                    className="h-10"
                  />
                </div>
              </div>

              {newPeriodError ? <p className="text-xs font-medium text-red-600">{newPeriodError}</p> : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreatePeriod(false)}
                disabled={createPeriodMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => createPeriodMutation.mutate(newPeriod)}
                disabled={!canSubmitNewPeriod || createPeriodMutation.isPending}
              >
                {createPeriodMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                Create Period
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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

      {workDetailsEmp && activePeriod ? (
        <EmployeeWorkDetailsModal
          employee={workDetailsEmp}
          periodStart={activePeriod.startDate}
          periodEnd={activePeriod.endDate}
          onClose={() => setWorkDetailsEmp(null)}
        />
      ) : null}
    </div>
  );
}
