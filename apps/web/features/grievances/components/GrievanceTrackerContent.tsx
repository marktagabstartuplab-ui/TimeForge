"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldAlert, Clock, CheckCircle2, Lock, Filter, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyGrievances, type Grievance, type GrievanceStatus } from "../api/grievances.service";
import { SubmitGrievanceModal } from "./SubmitGrievanceModal";

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

export function GrievanceTrackerContent() {
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);

  const { data: grievances, isLoading, isError, refetch } = useQuery({
    queryKey: ["grievances", "my", statusFilter],
    queryFn: () => listMyGrievances({ status: statusFilter === "ALL" ? undefined : statusFilter }),
  });

  const items = grievances ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Workplace Complaints & Grievances</h1>
          <p className="text-sm text-brand-muted">
            Submit formal complaints directly to HR with option for complete anonymity.
          </p>
        </div>
        <Button onClick={() => setIsSubmitOpen(true)} className="bg-brand text-white hover:bg-brand-dark">
          <Plus className="mr-1.5 h-4 w-4" /> Submit a Complaint
        </Button>
      </div>

      <SectionCard
        title="My Submitted Complaints"
        action={
          <div className="flex items-center gap-2">
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
          </div>
        ) : isError ? (
          <EmptyState message="Could not load your complaints." />
        ) : items.length === 0 ? (
          <EmptyState message="You haven't submitted any complaints yet. Submissions are strictly confidential and routed to HR only." />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedGrievance(item)}
                className="cursor-pointer rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4 shadow-sm transition-all hover:border-brand/40 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    {item.isAnonymous ? (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        <Lock className="h-3 w-3" /> Anonymous
                      </span>
                    ) : null}
                  </div>
                  <StatusBadge
                    label={item.status.replace(/_/g, " ")}
                    tone={STATUS_TONE[item.status] ?? "neutral"}
                  />
                </div>

                <h3 className="mt-2 text-base font-bold text-brand-navy">{item.subject}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-brand-muted">{item.description}</p>

                <div className="mt-3 flex items-center justify-between text-xs text-brand-muted border-t border-[#c3c6d2]/30 pt-2">
                  <span>Submitted: {formatDateTime(item.createdAt)}</span>
                  {item.resolvedAt ? (
                    <span className="font-medium text-emerald-600">Resolved on {formatDateTime(item.resolvedAt)}</span>
                  ) : (
                    <span>Status: {item.status.replace(/_/g, " ")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Detail Dialog */}
      {selectedGrievance ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedGrievance(null)}
        >
          <div
            className="w-full max-w-lg rounded-[16px] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#c3c6d2]/40 pb-3">
              <div>
                <span className="text-xs font-bold uppercase text-brand-muted">
                  {CATEGORY_LABELS[selectedGrievance.category] ?? selectedGrievance.category}
                </span>
                <h3 className="text-lg font-bold text-brand-navy">{selectedGrievance.subject}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGrievance(null)}
                className="text-xl font-bold leading-none text-brand-muted hover:text-brand-navy"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-brand-ink">
              <div className="flex items-center justify-between">
                <span className="text-xs text-brand-muted">Status:</span>
                <StatusBadge
                  label={selectedGrievance.status.replace(/_/g, " ")}
                  tone={STATUS_TONE[selectedGrievance.status] ?? "neutral"}
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-brand-muted mb-1">Details:</p>
                <div className="rounded-[10px] bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedGrievance.description}
                </div>
              </div>

              <div className="text-xs text-brand-muted space-y-1">
                <p>Submitted: {formatDateTime(selectedGrievance.createdAt)}</p>
                {selectedGrievance.isAnonymous ? (
                  <p className="text-slate-600 font-medium flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Submitted Anonymously
                  </p>
                ) : null}
                {selectedGrievance.resolvedAt ? (
                  <p className="text-emerald-600 font-medium">
                    Resolved at: {formatDateTime(selectedGrievance.resolvedAt)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedGrievance(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SubmitGrievanceModal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
