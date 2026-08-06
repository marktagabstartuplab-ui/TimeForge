"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  UserMinus,
} from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { useCan } from "@/features/auth/rbac";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";
import {
  approveClearanceItem,
  createNte,
  initiateClearance,
  listClearances,
  listNtes,
  type ClearanceChecklist,
  type ClearanceStatus,
  type DisciplineRecord,
  type DisciplineStatus,
} from "../api/employee-relations.service";

const NTE_TONE: Record<DisciplineStatus, BadgeTone> = {
  ISSUED: "warning",
  RESPONDED: "info",
  RESOLVED: "success",
  CLOSED: "neutral",
};

const CLEARANCE_TONE: Record<ClearanceStatus, BadgeTone> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tab = "NTE" | "CLEARANCE";

export function EmployeeRelationsContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tab, setTab] = useState<Tab>("NTE");

  const canIssueNte = useCan("discipline:create");
  const canInitiateClearance = useCan("clearance:create");
  const canApproveClearance = useCan("clearance:approve");

  // NTE composer state
  const [nteEmployeeId, setNteEmployeeId] = useState("");
  const [nteTitle, setNteTitle] = useState("");
  const [nteViolation, setNteViolation] = useState("");

  // Clearance composer state
  const [clearanceEmployeeId, setClearanceEmployeeId] = useState("");
  const [clearanceNotes, setClearanceNotes] = useState("");

  const [activeNte, setActiveNte] = useState<DisciplineRecord | null>(null);

  const { data: employeePage } = useQuery({
    queryKey: ["employees", "relations-picker"],
    queryFn: () => listEmployees({ limit: 100 }),
  });
  const employees = useMemo(() => employeePage?.data ?? [], [employeePage]);

  const {
    data: ntes,
    isLoading: ntesLoading,
    isError: ntesError,
    refetch: refetchNtes,
  } = useQuery({ queryKey: ["employee-relations", "ntes"], queryFn: () => listNtes() });

  const {
    data: clearances,
    isLoading: clearancesLoading,
    isError: clearancesError,
    refetch: refetchClearances,
  } = useQuery({ queryKey: ["employee-relations", "clearances"], queryFn: () => listClearances() });

  const nteMutation = useMutation({
    mutationFn: createNte,
    onSuccess: () => {
      setToast({ message: "Notice to Explain issued. The employee has been notified.", tone: "success" });
      setNteEmployeeId("");
      setNteTitle("");
      setNteViolation("");
      queryClient.invalidateQueries({ queryKey: ["employee-relations", "ntes"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to issue the NTE.", tone: "error" });
    },
  });

  const clearanceMutation = useMutation({
    mutationFn: initiateClearance,
    onSuccess: () => {
      setToast({ message: "Clearance checklist created and routed to IT, Finance and HR.", tone: "success" });
      setClearanceEmployeeId("");
      setClearanceNotes("");
      queryClient.invalidateQueries({ queryKey: ["employee-relations", "clearances"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to initiate clearance.", tone: "error" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) =>
      approveClearanceItem(checklistId, itemId),
    onSuccess: (updated) => {
      setToast({
        message:
          updated?.status === "COMPLETED"
            ? "Clearance completed — final pay is no longer blocked."
            : "Clearance item approved.",
        tone: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["employee-relations", "clearances"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to approve clearance item.", tone: "error" });
    },
  });

  const approvedCount = (c: ClearanceChecklist) => c.items.filter((i) => i.isApproved).length;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Employee Relations & Discipline</h1>
        <p className="text-sm text-brand-muted">
          Notices to Explain, written explanations and offboarding clearance. Every action here is
          written to the audit trail for DOLE compliance.
        </p>
      </div>

      <div className="flex gap-2 border-b border-[#c3c6d2]/40">
        {(
          [
            { key: "NTE" as const, label: "Notices to Explain", icon: ShieldAlert },
            { key: "CLEARANCE" as const, label: "Clearance Tracker", icon: ClipboardList },
          ]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-b-2 border-brand text-brand-navy"
                : "text-brand-muted hover:text-brand-navy"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "NTE" ? (
        <>
          {canIssueNte ? (
            <SectionCard title="Issue a Notice to Explain">
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Employee</label>
                    <Select value={nteEmployeeId} onValueChange={(v) => setNteEmployeeId(v ?? "")}>
                      <SelectTrigger className="h-9 border-[#c3c6d2] text-xs">
                        <SelectValue placeholder="Select an employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Memo Title</label>
                    <Input
                      className="h-9 text-xs"
                      placeholder="e.g. Habitual Tardiness"
                      value={nteTitle}
                      onChange={(e) => setNteTitle(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-brand-navy">Violation Description</label>
                  <textarea
                    rows={4}
                    placeholder="Describe the specific acts or omissions, with dates, that the employee is being asked to explain…"
                    value={nteViolation}
                    onChange={(e) => setNteViolation(e.target.value)}
                    className="w-full rounded-[10px] border border-[#c3c6d2] p-3 text-xs outline-none focus:border-brand"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="bg-brand text-white hover:bg-brand-dark"
                    disabled={
                      nteMutation.isPending ||
                      !nteEmployeeId ||
                      !nteTitle.trim() ||
                      !nteViolation.trim()
                    }
                    onClick={() =>
                      nteMutation.mutate({
                        employeeId: nteEmployeeId,
                        title: nteTitle.trim(),
                        violationDescription: nteViolation.trim(),
                      })
                    }
                  >
                    {nteMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Issue NTE
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Disciplinary Records"
            action={
              <Button variant="outline" size="sm" onClick={() => refetchNtes()} className="h-9 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            }
          >
            {ntesLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : ntesError ? (
              <EmptyState message="Could not load disciplinary records." />
            ) : (ntes ?? []).length === 0 ? (
              <EmptyState message="No Notices to Explain have been issued." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold uppercase tracking-wider text-brand-muted">
                      <th className="px-4 py-3">Memo</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Issued</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {(ntes ?? []).map((n) => (
                      <tr key={n.id} className="transition-colors hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-semibold text-brand-navy">{n.title}</td>
                        <td className="px-4 py-3">
                          {n.employee ? `${n.employee.firstName} ${n.employee.lastName}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-brand-muted">
                          {formatDateTime(n.issuedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={n.status} tone={NTE_TONE[n.status] ?? "neutral"} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="xs" onClick={() => setActiveNte(n)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        <>
          {canInitiateClearance ? (
            <SectionCard title="Start Offboarding Clearance">
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Exiting Employee</label>
                    <Select
                      value={clearanceEmployeeId}
                      onValueChange={(v) => setClearanceEmployeeId(v ?? "")}
                    >
                      <SelectTrigger className="h-9 border-[#c3c6d2] text-xs">
                        <SelectValue placeholder="Select an employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Notes (optional)</label>
                    <Input
                      className="h-9 text-xs"
                      placeholder="e.g. Last day 30 Aug, resignation"
                      value={clearanceNotes}
                      onChange={(e) => setClearanceNotes(e.target.value)}
                    />
                  </div>
                </div>
                <p className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <Lock className="mr-1 inline h-3.5 w-3.5" />
                  Final payroll for this employee is blocked until every department has signed off.
                </p>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="bg-brand text-white hover:bg-brand-dark"
                    disabled={clearanceMutation.isPending || !clearanceEmployeeId}
                    onClick={() =>
                      clearanceMutation.mutate({
                        employeeId: clearanceEmployeeId,
                        notes: clearanceNotes.trim() || undefined,
                      })
                    }
                  >
                    {clearanceMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserMinus className="mr-1 h-3.5 w-3.5" />
                    )}
                    Initiate Clearance
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Clearance Trackers"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchClearances()}
                className="h-9 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            }
          >
            {clearancesLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : clearancesError ? (
              <EmptyState message="Could not load clearance trackers." />
            ) : (clearances ?? []).length === 0 ? (
              <EmptyState message="No employees are currently going through clearance." />
            ) : (
              <div className="flex flex-col gap-4">
                {(clearances ?? []).map((c) => (
                  <div key={c.id} className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c3c6d2]/30 pb-3">
                      <div>
                        <div className="font-semibold text-brand-navy">
                          {c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : "Employee"}
                        </div>
                        <div className="text-xs text-brand-muted">
                          {c.employee?.department?.name ?? c.employee?.jobTitle ?? "—"} · Started{" "}
                          {formatDateTime(c.initiatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-brand-muted">
                          {approvedCount(c)} / {c.items.length} approved
                        </span>
                        <StatusBadge
                          label={c.status.replace(/_/g, " ")}
                          tone={CLEARANCE_TONE[c.status] ?? "neutral"}
                        />
                      </div>
                    </div>

                    <ul className="mt-3 flex flex-col gap-2">
                      {c.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-slate-50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                              {item.department}
                            </span>
                            <span className="text-xs text-brand-navy">{item.title}</span>
                          </div>
                          {item.isApproved ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approved {formatDateTime(item.approvedAt)}
                            </span>
                          ) : canApproveClearance ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={approveMutation.isPending}
                              onClick={() =>
                                approveMutation.mutate({ checklistId: c.id, itemId: item.id })
                              }
                            >
                              Approve
                            </Button>
                          ) : (
                            <span className="text-xs text-brand-muted">Awaiting {item.department}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {activeNte ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setActiveNte(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[16px] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#c3c6d2]/40 pb-3">
              <div>
                <span className="text-xs font-bold uppercase text-brand-muted">Notice to Explain</span>
                <h3 className="text-lg font-bold text-brand-navy">{activeNte.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveNte(null)}
                className="text-xl font-bold leading-none text-brand-muted hover:text-brand-navy"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="text-brand-muted">Employee: </span>
                <span className="font-semibold text-brand-navy">
                  {activeNte.employee
                    ? `${activeNte.employee.firstName} ${activeNte.employee.lastName}`
                    : "—"}
                </span>
                <span className="ml-4 text-brand-muted">Issued: </span>
                {formatDateTime(activeNte.issuedAt)}
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-brand-navy">Violation Description</p>
                <div className="whitespace-pre-wrap rounded-[10px] bg-slate-50 p-3 text-sm leading-relaxed">
                  {activeNte.violationDescription}
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-brand-navy">
                  Employee&rsquo;s Written Explanation
                </p>
                {activeNte.employeeResponse ? (
                  <>
                    <div className="whitespace-pre-wrap rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed">
                      {activeNte.employeeResponse}
                    </div>
                    <p className="mt-1 text-[11px] text-brand-muted">
                      Submitted {formatDateTime(activeNte.respondedAt)}
                    </p>
                  </>
                ) : (
                  <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Awaiting the employee&rsquo;s written explanation (Twin-Notice Rule).
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-[#c3c6d2]/40 pt-4">
              <Button variant="outline" size="sm" onClick={() => setActiveNte(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
