"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Lock, LockOpen, MessageSquare, Send } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Dialog, DialogContent, DialogTitle, DialogCloseButton } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/features/auth/components/fields";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  getMyScrumEditRequest,
  listScrumEntries,
  requestScrumEdit,
  resubmitScrumEntry,
  updateScrumEntry,
  type ScrumEntry,
  type ScrumTaskStatus,
} from "@/features/scrum/api/scrum.service";
import { ApiError } from "@/lib/api/client";
import { toIsoDate } from "@/lib/time";

const DAY_STATUS_META: Record<ScrumTaskStatus, { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: "Not Started", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
};

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/**
 * Read-only history of the employee's own previously submitted Daily Scrum
 * entries, plus the revision workflow for them (BUG-AQ): a locked row offers
 * "Request Unlock", and once the supervisor grants it the same row's detail view
 * turns into an editable form ending in "Resubmit", which saves and re-locks.
 * Reuses the existing GET /scrum-entries API (already own-user-scoped
 * server-side for non-supervisor callers) — no new list endpoint.
 */
export function ScrumHistoryCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["scrum-entries", "history"],
    queryFn: () => listScrumEntries({ limit: 30 }),
  });
  // Today/Blockers/Supervisor Comment are clamped to 2 lines in the table
  // (long entries were unreadable, no way to see the rest) — clicking a row
  // opens the full text here instead.
  const [selected, setSelected] = useState<ScrumEntry | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Unlock-request modal: the locked entry being asked about + the reason the
  // supervisor will see. The backend requires at least 5 characters.
  const [requestTarget, setRequestTarget] = useState<ScrumEntry | null>(null);
  const [requestReason, setRequestReason] = useState("");

  // Draft of an unlocked entry being revised, seeded when the detail modal opens.
  const [draft, setDraft] = useState<{ today: string; blockers: string; notes: string } | null>(null);

  const today = toIsoDate(new Date());
  const entries = [...(data?.data ?? [])]
    .filter((e) => toIsoDate(new Date(e.entryDate)) !== today)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  // Deep-link support: if ?scrum=<id> is in the URL, auto-open that entry's
  // detail modal so "View that scrum" takes the employee straight to the record.
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("scrum");
  useEffect(() => {
    if (!deepLinkId || entries.length === 0) return;
    const match = entries.find((e) => e.id === deepLinkId);
    if (match) setSelected(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, entries.length]);

  // Keep the open modal pointed at the freshest copy of its entry — after a
  // save or a resubmit the row's version/lock state changes, and a stale
  // `selected` would send the next request with an expired version token.
  useEffect(() => {
    if (!selected) return;
    const fresh = entries.find((e) => e.id === selected.id);
    if (fresh && fresh.version !== selected.version) setSelected(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Seed / clear the revision draft as the modal opens on an unlocked entry.
  useEffect(() => {
    if (selected && !selected.isLocked) {
      setDraft({
        today: selected.today ?? "",
        blockers: selected.blockers ?? "",
        notes: selected.notes ?? "",
      });
    } else {
      setDraft(null);
    }
  }, [selected]);

  // The employee's own request for the entry in the unlock modal — surfaces a
  // still-pending ask instead of silently sending a duplicate.
  const { data: myRequest } = useQuery({
    queryKey: ["scrum-edit-request", requestTarget?.id],
    queryFn: () => getMyScrumEditRequest(requestTarget!.id),
    enabled: Boolean(requestTarget),
  });

  const refreshHistory = () => queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });

  const toastError = (err: unknown, fallback: string) =>
    setToast({ message: err instanceof ApiError ? err.message : fallback, tone: "error" });

  const requestUnlock = useMutation({
    mutationFn: () => requestScrumEdit(requestTarget!.id, requestReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrum-edit-request", requestTarget?.id] });
      setRequestTarget(null);
      setRequestReason("");
      setToast({ message: "Unlock request sent to your supervisor." });
    },
    onError: (err) => toastError(err, "Could not send your unlock request"),
  });

  // Saves the revision without closing the day, so a long edit isn't lost.
  const saveDraft = useMutation({
    mutationFn: () =>
      updateScrumEntry(selected!.id, {
        today: draft!.today,
        blockers: draft!.blockers,
        notes: draft!.notes,
        version: selected!.version,
      }),
    onSuccess: (updated) => {
      setSelected(updated);
      refreshHistory();
      setToast({ message: "Changes saved." });
    },
    onError: (err) => toastError(err, "Could not save your changes"),
  });

  // Resubmit is save-then-lock: the edits have to land before the entry closes,
  // or the lock would freeze the pre-edit text.
  const resubmit = useMutation({
    mutationFn: async () => {
      const saved = await updateScrumEntry(selected!.id, {
        today: draft!.today,
        blockers: draft!.blockers,
        notes: draft!.notes,
        version: selected!.version,
      });
      return resubmitScrumEntry(saved.id);
    },
    onSuccess: (updated) => {
      setSelected(updated);
      refreshHistory();
      setToast({ message: "Scrum resubmitted and locked." });
    },
    onError: (err) => toastError(err, "Could not resubmit this scrum"),
  });

  const columns: DataTableColumn<ScrumEntry>[] = [
    {
      key: "date",
      header: "Date",
      render: (e) => <span className="font-semibold text-brand-navy">{formatEntryDate(e.entryDate)}</span>,
    },
    {
      key: "today",
      header: "Today's Commitments",
      className: "max-w-[320px]",
      render: (e) => <span className="line-clamp-2 text-brand-muted">{e.today || "—"}</span>,
    },
    {
      key: "blockers",
      header: "Blockers",
      className: "max-w-[220px]",
      render: (e) => <span className="line-clamp-2 text-brand-muted">{e.blockers || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (e) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge {...DAY_STATUS_META[e.status]} />
          {e.isLocked ? <Lock className="h-3.5 w-3.5 text-brand-muted" aria-label="Locked" /> : null}
        </div>
      ),
    },
    {
      key: "supervisorNote",
      header: "Supervisor Comment",
      className: "max-w-[240px]",
      render: (e) => (
        <span className="line-clamp-2 text-brand-muted">{e.supervisorNote || "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "Revision",
      render: (e) =>
        e.isLocked ? (
          <button
            type="button"
            onClick={(event) => {
              // The row itself opens the detail modal — this button has its own
              // destination, so it must not also trigger the row handler.
              event.stopPropagation();
              setRequestTarget(e);
              setRequestReason("");
            }}
            className="flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Request Unlock
          </button>
        ) : (
          <span className="text-xs font-semibold text-brand">Editable</span>
        ),
    },
  ];

  const editable = Boolean(selected && !selected.isLocked && draft);
  const busy = saveDraft.isPending || resubmit.isPending;

  return (
    <SectionCard
      title="Daily Scrum History"
      action={<History className="h-5 w-5 text-brand-muted" aria-hidden="true" />}
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : isError ? (
        <EmptyState message="Could not load your scrum history." action={<button type="button" onClick={() => refetch()} className="text-sm font-semibold text-brand hover:underline">Retry</button>} />
      ) : (
        <>
          {entries.length > 0 ? (
            <p className="mb-2 text-xs text-brand-muted">
              Click a row to read the full entry and comment. Locked days can be reopened — ask your
              supervisor with <strong>Request Unlock</strong>, then edit and resubmit.
            </p>
          ) : null}
          <DataTable
            aria-label="Daily Scrum history"
            columns={columns}
            rows={entries}
            rowKey={(e) => e.id}
            onRowClick={(e) => setSelected(e)}
            emptyState={<EmptyState message="No previous submissions yet — your past Daily Scrum entries will appear here." />}
          />
        </>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(next) => !next && setSelected(null)}>
        <DialogContent className="w-[min(600px,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 px-6 py-4">
            <DialogTitle>{selected ? formatEntryDate(selected.entryDate) : ""}</DialogTitle>
            <DialogCloseButton />
          </div>
          {selected ? (
            <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto px-6 py-5">
              <div className="flex items-center gap-2">
                <StatusBadge {...DAY_STATUS_META[selected.status]} />
                {selected.isLocked ? (
                  <span className="flex items-center gap-1 text-xs text-brand-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Locked
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                    <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> Unlocked for editing
                  </span>
                )}
              </div>

              {editable && draft ? (
                <>
                  <p className="rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-xs text-brand-muted">
                    Your supervisor reopened this day. Make your corrections, then{" "}
                    <strong>Resubmit</strong> — that saves the entry and locks it again.
                  </p>
                  <div>
                    <FieldLabel htmlFor="hist-today">Today&apos;s Commitments</FieldLabel>
                    <Textarea
                      id="hist-today"
                      rows={4}
                      value={draft.today}
                      onChange={(e) => setDraft({ ...draft, today: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="hist-blockers">Blockers</FieldLabel>
                    <Textarea
                      id="hist-blockers"
                      rows={3}
                      value={draft.blockers}
                      onChange={(e) => setDraft({ ...draft, blockers: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="hist-notes">Notes</FieldLabel>
                    <Textarea
                      id="hist-notes"
                      rows={3}
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Today&apos;s Commitments</p>
                    <p className="whitespace-pre-wrap text-sm text-brand-ink">{selected.today || "—"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Blockers</p>
                    <p className="whitespace-pre-wrap text-sm text-brand-ink">{selected.blockers || "—"}</p>
                  </div>
                </>
              )}

              {selected.supervisorNote ? (
                <div className="rounded-[12px] border border-brand/20 bg-brand-cyan/5 p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.6px] text-brand">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Supervisor Comment
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-brand-ink">{selected.supervisorNote}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#c3c6d2]/40 pt-4">
                {selected.isLocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRequestTarget(selected);
                      setRequestReason("");
                    }}
                    className="flex h-11 items-center gap-1.5 rounded-[10px] border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-700 hover:bg-amber-100"
                  >
                    <LockOpen className="h-4 w-4" aria-hidden="true" />
                    Request Unlock
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => saveDraft.mutate()}
                      disabled={busy}
                      className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2] bg-white px-4 text-sm font-bold text-brand-navy hover:bg-[#f6f3f4] disabled:opacity-60"
                    >
                      {saveDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => resubmit.mutate()}
                      disabled={busy}
                      title="Saves your edits and locks this scrum again"
                      className="flex h-11 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resubmit.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden="true" />
                      )}
                      Resubmit
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Unlock-request modal — the reason is what the supervisor reads in their queue. */}
      <Dialog open={Boolean(requestTarget)} onOpenChange={(next) => !next && setRequestTarget(null)}>
        <DialogContent className="w-[min(480px,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 px-6 py-4">
            <DialogTitle>Request unlock</DialogTitle>
            <DialogCloseButton />
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            <p className="text-sm text-brand-muted">
              Your supervisor will be notified and can reopen{" "}
              {requestTarget ? formatEntryDate(requestTarget.entryDate) : "this day"} for editing.
            </p>
            {myRequest?.status === "PENDING" ? (
              <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                You already have a request awaiting review — sending again updates its reason.
              </p>
            ) : null}
            {myRequest?.status === "DECLINED" && myRequest.resolutionNote ? (
              <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Previously declined: {myRequest.resolutionNote}
              </p>
            ) : null}
            <div>
              <FieldLabel htmlFor="hist-request-reason">Reason</FieldLabel>
              <Textarea
                id="hist-request-reason"
                rows={3}
                placeholder="Why does this entry need to change?"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
              />
              <p className="mt-1 text-xs text-brand-muted">At least 5 characters.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRequestTarget(null)}
                className="h-11 rounded-[10px] border border-[#c3c6d2] bg-white px-4 text-sm font-bold text-brand-navy hover:bg-[#f6f3f4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => requestUnlock.mutate()}
                disabled={requestReason.trim().length < 5 || requestUnlock.isPending}
                className="flex h-11 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requestUnlock.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Send request
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </SectionCard>
  );
}
