"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2, ShieldAlert } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  listClearances,
  listNtes,
  respondToNte,
  type ClearanceStatus,
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

export function MyHrRecordsContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  /** Draft explanation per NTE id — kept keyed so several open memos don't share one box. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: ntes, isLoading: ntesLoading, isError: ntesError } = useQuery({
    queryKey: ["employee-relations", "my-ntes"],
    queryFn: () => listNtes(),
  });

  const { data: clearances, isLoading: clearancesLoading } = useQuery({
    queryKey: ["employee-relations", "my-clearance"],
    queryFn: () => listClearances(),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) => respondToNte(id, response),
    onSuccess: (_data, vars) => {
      setToast({ message: "Your written explanation has been submitted to HR.", tone: "success" });
      setDrafts((d) => ({ ...d, [vars.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["employee-relations", "my-ntes"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to submit your explanation.", tone: "error" });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div>
        <h1 className="text-2xl font-bold text-brand-navy">My HR Records</h1>
        <p className="text-sm text-brand-muted">
          Disciplinary notices addressed to you, and your offboarding clearance if one is in progress.
        </p>
      </div>

      <SectionCard title="Notices to Explain">
        {ntesLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : ntesError ? (
          <EmptyState message="Could not load your disciplinary records." />
        ) : (ntes ?? []).length === 0 ? (
          <EmptyState message="You have no disciplinary notices. " />
        ) : (
          <div className="flex flex-col gap-4">
            {(ntes ?? []).map((n) => (
              <div key={n.id} className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                      <span className="font-semibold text-brand-navy">{n.title}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-brand-muted">
                      Issued {formatDateTime(n.issuedAt)}
                      {n.issuer ? ` by ${n.issuer.firstName} ${n.issuer.lastName}` : ""}
                    </div>
                  </div>
                  <StatusBadge label={n.status} tone={NTE_TONE[n.status] ?? "neutral"} />
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold text-brand-navy">Violation Description</p>
                  <div className="whitespace-pre-wrap rounded-[10px] bg-slate-50 p-3 text-sm leading-relaxed">
                    {n.violationDescription}
                  </div>
                </div>

                {n.employeeResponse ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-brand-navy">
                      Your Written Explanation
                    </p>
                    <div className="whitespace-pre-wrap rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed">
                      {n.employeeResponse}
                    </div>
                    <p className="mt-1 text-[11px] text-brand-muted">
                      Submitted {formatDateTime(n.respondedAt)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-brand-navy">
                      Submit Your Written Explanation
                    </p>
                    <textarea
                      rows={4}
                      placeholder="Explain your side. This becomes part of the official record."
                      value={drafts[n.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: e.target.value }))}
                      className="w-full rounded-[10px] border border-[#c3c6d2] p-3 text-xs outline-none focus:border-brand"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        className="bg-brand text-white hover:bg-brand-dark"
                        disabled={respondMutation.isPending || !(drafts[n.id] ?? "").trim()}
                        onClick={() =>
                          respondMutation.mutate({ id: n.id, response: (drafts[n.id] ?? "").trim() })
                        }
                      >
                        {respondMutation.isPending ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Submit Explanation
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="My Clearance">
        {clearancesLoading ? (
          <Skeleton className="h-24" />
        ) : (clearances ?? []).length === 0 ? (
          <EmptyState message="You have no clearance in progress." />
        ) : (
          <div className="flex flex-col gap-4">
            {(clearances ?? []).map((c) => (
              <div key={c.id} className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c3c6d2]/30 pb-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-brand" />
                    <span className="text-sm font-semibold text-brand-navy">
                      Offboarding Clearance
                    </span>
                  </div>
                  <StatusBadge
                    label={c.status.replace(/_/g, " ")}
                    tone={CLEARANCE_TONE[c.status] ?? "neutral"}
                  />
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
                          <CheckCircle2 className="h-3.5 w-3.5" /> Cleared
                        </span>
                      ) : (
                        <span className="text-xs text-brand-muted">Pending {item.department}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {c.status !== "COMPLETED" ? (
                  <p className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Your final pay is released once every department above has signed off.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
