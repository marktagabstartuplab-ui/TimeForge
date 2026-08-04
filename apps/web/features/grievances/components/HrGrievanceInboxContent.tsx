"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Lock, CheckCircle2, RefreshCw, MessageSquare, User, Clock, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  listAllGrievances,
  updateGrievance,
  type Grievance,
  type GrievanceStatus,
} from "../api/grievances.service";

const STATUS_TONE: Record<GrievanceStatus, BadgeTone> = {
  SUBMITTED: "neutral",
  UNDER_REVIEW: "warning",
  RESOLVED: "success",
};

const CATEGORY_LABELS: Record<string, string> = {
  WORKPLACE_ENVIRONMENT: "Workplace Environment",
  COLLEAGUE_ISSUE: "Colleague Issue",
  PAYROLL_DISPUTE: "Payroll Dispute",
  HARASSMENT: "Harassment / Discrimination",
  SAFETY_CONCERN: "Safety Concern",
  MANAGEMENT_ISSUE: "Management Issue",
  OTHER: "Other Issue",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HrGrievanceInboxContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [activeGrievance, setActiveGrievance] = useState<Grievance | null>(null);

  // HR Edit State inside detail modal
  const [editStatus, setEditStatus] = useState<GrievanceStatus>("SUBMITTED");
  const [internalNotes, setInternalNotes] = useState("");

  const { data: grievances, isLoading, isError, refetch } = useQuery({
    queryKey: ["grievances", "hr-inbox", statusFilter],
    queryFn: () => listAllGrievances({ status: statusFilter === "ALL" ? undefined : statusFilter }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: GrievanceStatus; notes: string }) =>
      updateGrievance(id, { status, internalNotes: notes }),
    onSuccess: (updated) => {
      setToast({ message: "Complaint updated successfully.", tone: "success" });
      setActiveGrievance(updated);
      queryClient.invalidateQueries({ queryKey: ["grievances"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to update complaint.", tone: "error" });
    },
  });

  const items = (grievances ?? []).filter((g) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      g.subject.toLowerCase().includes(term) ||
      g.description.toLowerCase().includes(term) ||
      (g.employee && `${g.employee.firstName} ${g.employee.lastName}`.toLowerCase().includes(term))
    );
  });

  const openDetail = (g: Grievance) => {
    setActiveGrievance(g);
    setEditStatus(g.status);
    setInternalNotes(g.internalNotes ?? "");
  };

  const handleSave = () => {
    if (!activeGrievance) return;
    updateMutation.mutate({
      id: activeGrievance.id,
      status: editStatus,
      notes: internalNotes,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">HR Complaints & Grievances Inbox</h1>
          <p className="text-sm text-brand-muted">
            Confidential employee submissions. Internal notes are strictly hidden from employees.
          </p>
        </div>
      </div>

      <SectionCard
        title="Grievances Management"
        action={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search complaint or subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 text-xs"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "ALL")}>
              <SelectTrigger className="h-9 w-40 rounded-[8px] border-[#c3c6d2] bg-white text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : isError ? (
          <EmptyState message="Could not load HR complaints inbox." />
        ) : items.length === 0 ? (
          <EmptyState message="No workplace complaints match the current filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Subject & Category</th>
                  <th className="py-3 px-4">Submitted By</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {items.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-brand-navy">{g.subject}</div>
                      <div className="text-xs text-brand-muted">
                        {CATEGORY_LABELS[g.category] ?? g.category}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {g.isAnonymous ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          <Lock className="h-3 w-3" /> Anonymous Employee
                        </span>
                      ) : g.employee ? (
                        <div>
                          <div className="font-medium text-brand-navy">
                            {g.employee.firstName} {g.employee.lastName}
                          </div>
                          <div className="text-xs text-brand-muted">
                            {g.employee.department?.name ?? g.employee.jobTitle ?? "Employee"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-muted">Unknown</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-brand-muted tabular-nums">
                      {formatDateTime(g.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        label={g.status.replace(/_/g, " ")}
                        tone={STATUS_TONE[g.status] ?? "neutral"}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="outline" size="xs" onClick={() => openDetail(g)}>
                        Review & Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* HR Review & Notes Dialog */}
      {activeGrievance ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setActiveGrievance(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[16px] bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#c3c6d2]/40 pb-3">
              <div>
                <span className="text-xs font-bold uppercase text-brand-muted">
                  {CATEGORY_LABELS[activeGrievance.category] ?? activeGrievance.category}
                </span>
                <h3 className="text-lg font-bold text-brand-navy">{activeGrievance.subject}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveGrievance(null)}
                className="text-xl font-bold leading-none text-brand-muted hover:text-brand-navy"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between text-xs rounded-[8px] bg-slate-50 p-3 border border-slate-200">
                <div>
                  <span className="text-brand-muted">Complainant: </span>
                  {activeGrievance.isAnonymous ? (
                    <span className="font-semibold text-slate-700">Anonymous Employee (Identity Protected)</span>
                  ) : activeGrievance.employee ? (
                    <span className="font-semibold text-brand-navy">
                      {activeGrievance.employee.firstName} {activeGrievance.employee.lastName} ({activeGrievance.employee.email})
                    </span>
                  ) : (
                    <span>N/A</span>
                  )}
                </div>
                <span className="text-brand-muted">Submitted: {formatDateTime(activeGrievance.createdAt)}</span>
              </div>

              <div>
                <p className="text-xs font-semibold text-brand-navy mb-1">Employee Description:</p>
                <div className="rounded-[10px] bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {activeGrievance.description}
                </div>
              </div>

              <div className="border-t border-[#c3c6d2]/40 pt-4 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-brand-navy">Update Status</label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as GrievanceStatus)}>
                    <SelectTrigger className="h-9 text-xs border-[#c3c6d2]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUBMITTED">Submitted</SelectItem>
                      <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-brand-navy flex items-center gap-1">
                      <Lock className="h-3.5 w-3.5 text-amber-600" /> Internal HR Notes
                    </label>
                    <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                      Hidden from Employee
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Enter confidential HR investigation notes, resolution steps, or meeting logs..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className="w-full rounded-[10px] border border-[#c3c6d2] p-3 text-xs outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-[#c3c6d2]/40 pt-4">
              <Button variant="outline" size="sm" onClick={() => setActiveGrievance(null)}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="bg-brand text-white hover:bg-brand-dark"
              >
                {updateMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Save HR Changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
