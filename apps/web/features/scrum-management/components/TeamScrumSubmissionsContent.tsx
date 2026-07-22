"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Calendar, AlertCircle, MessageSquare, Flag, Loader2, ChevronLeft, ChevronRight, Check, Lock, LockOpen, Sparkles, X } from "lucide-react";
import { getTeamScrums, postScrumComment, postScrumFlag, postScrumUnlock } from "../api/scrum-management.service";
import { runAndPollAiJob } from "../api/ai-insight.service";
import { AiFormattedText } from "@/components/shared/AiFormattedText";
import { SectionCard } from "@/components/shared/SectionCard";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { RecurringIssuesPanel } from "@/features/recurring-issues/components/RecurringIssuesPanel";

export function TeamScrumSubmissionsContent({
  initialHasBlockers = false,
  initialNeedsReview = true,
}: {
  initialHasBlockers?: boolean;
  initialNeedsReview?: boolean;
}) {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [hasBlockers, setHasBlockers] = useState(initialHasBlockers);
  const [needsReview, setNeedsReview] = useState(initialNeedsReview);
  const [page, setPage] = useState(1);

  // Comments local state map: entryId -> text
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // BLOCKER_DETECTION — AI analysis of a member's blockers over the last 14
  // days. Keyed by userId so the result renders inside the right card.
  const [blockerAnalyzing, setBlockerAnalyzing] = useState<string | null>(null);
  const [blockerAnalysis, setBlockerAnalysis] = useState<{ userId: string; summary: string; recommendation: string } | null>(null);

  const handleBlockerAnalysis = async (userId: string) => {
    setBlockerAnalyzing(userId);
    try {
      const result = await runAndPollAiJob("BLOCKER_DETECTION", "user", userId);
      setBlockerAnalysis({ userId, summary: result.summary, recommendation: result.recommendation });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "AI blocker analysis failed.", tone: "error" });
    } finally {
      setBlockerAnalyzing(null);
    }
  };

  // Unlock modal: the entry being unlocked + the optional reason draft.
  const [unlockTarget, setUnlockTarget] = useState<{ id: string; name: string } | null>(null);
  const [unlockReason, setUnlockReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["scrum-team-submissions", { search, date, hasBlockers, needsReview, page }],
    queryFn: () =>
      getTeamScrums({
        search: search || undefined,
        from: date ? `${date}T00:00:00.000Z` : undefined,
        to: date ? `${date}T23:59:59.999Z` : undefined,
        hasBlockers: hasBlockers ? "true" : undefined,
        needsReview: needsReview ? "true" : undefined,
        limit: 10,
      }),
  });

  const commentMutation = useMutation({
    mutationFn: ({ id, comment, version }: { id: string; comment: string; version: number }) =>
      postScrumComment(id, comment, version),
    onSuccess: () => {
      setToast({ message: "Comment posted successfully", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrum-team-submissions"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to post comment", tone: "error" });
    },
  });

  const flagMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => postScrumFlag(id, version),
    onSuccess: () => {
      setToast({ message: "Recurring issue flagged", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrum-team-submissions"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to flag entry", tone: "error" });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => postScrumUnlock(id, reason),
    onSuccess: () => {
      setToast({ message: "Today's Commitment unlocked", tone: "success" });
      setUnlockTarget(null);
      setUnlockReason("");
      queryClient.invalidateQueries({ queryKey: ["scrum-team-submissions"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to unlock commitment", tone: "error" });
    },
  });

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 10;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Team Scrum Submissions</h1>
        <p className="text-sm text-brand-muted">Review daily updates and identify blockers to ensure delivery timelines.</p>
      </div>

      {/* Header controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-4 rounded-xl border border-[#c3c6d2]/30">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            placeholder="Search by employee name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[#c3c6d2] py-2 pl-10 pr-4 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#c3c6d2] py-2 pl-10 pr-3 text-sm outline-none focus:border-brand"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-brand-navy cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasBlockers}
              onChange={(e) => {
                setHasBlockers(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            Show open blockers only
          </label>

          <label className="flex items-center gap-2 text-sm text-brand-navy cursor-pointer select-none">
            <input
              type="checkbox"
              checked={needsReview}
              onChange={(e) => {
                setNeedsReview(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            Needs review
          </label>
        </div>
      </div>

      {/* Cards list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#c3c6d2]/30">
          <AlertCircle className="mx-auto h-12 w-12 text-brand-muted" />
          <h3 className="mt-4 text-lg font-semibold text-brand-navy">No scrum submissions found</h3>
          <p className="mt-2 text-sm text-brand-muted">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {items.map((item) => (
            <SectionCard
              key={item.id}
              title={`${item.user.firstName} ${item.user.lastName}`}
              action={
                <div className="flex items-center gap-3">
                  <span className="text-xs text-brand-muted">
                    {item.user.department?.name || "Unassigned"} • {new Date(item.entryDate).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBlockerAnalysis(item.userId)}
                    disabled={blockerAnalyzing !== null}
                    title="AI analysis of this member's blockers over the last 14 days"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#c3c6d2] bg-gradient-to-r from-brand/5 to-brand-cyan/5 px-2 py-0.5 text-xs font-semibold text-brand shadow-sm transition-all hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {blockerAnalyzing === item.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI Blockers
                  </button>
                  {item.recurringBlocker ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      <AlertCircle className="h-3 w-3" />
                      Recurring Blocker
                    </span>
                  ) : null}
                  {item.isLocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      <Lock className="h-3 w-3" />
                      Locked
                    </span>
                  ) : null}
                  <StatusBadge
                    label={item.status === "BLOCKED" ? "Blocked" : "On Track"}
                    tone={item.status === "BLOCKED" ? "danger" : "success"}
                  />
                </div>
              }
            >
              <div className="flex items-center gap-3 -mt-3 mb-4">
                <Avatar firstName={item.user.firstName} lastName={item.user.lastName} size="md" />
                <div>
                  <h3 className="text-base font-semibold text-brand-navy">
                    {item.user.firstName} {item.user.lastName}
                  </h3>
                  <p className="text-xs text-brand-muted">
                    {item.user.department?.name || "Unassigned"} • {new Date(item.entryDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {blockerAnalysis && blockerAnalysis.userId === item.userId ? (
                <div className="mb-4 rounded-[12px] border border-brand/25 bg-brand-cyan/5 p-4 text-sm text-brand-ink">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
                        <Sparkles className="h-3.5 w-3.5" /> AI Blocker Analysis — last 14 days
                      </p>
                      <AiFormattedText text={blockerAnalysis.summary} className="leading-relaxed" />
                      {blockerAnalysis.recommendation ? (
                        <AiFormattedText text={blockerAnalysis.recommendation} className="leading-relaxed text-brand-muted" />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setBlockerAnalysis(null)}
                      className="shrink-0 text-brand-muted hover:text-brand-navy"
                      aria-label="Dismiss blocker analysis"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Panel: Progress and Lists */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-brand-navy mb-1.5">Yesterday&apos;s Completed Work</h4>
                    <p className="text-sm text-brand-ink bg-[#f5f6fa] p-3 rounded-lg border border-[#c3c6d2]/20 whitespace-pre-wrap">
                      {item.yesterday || "No yesterday details log entered."}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-brand-navy mb-1.5">Today&apos;s Planned Work</h4>
                    {item.tasks && item.tasks.length > 0 ? (
                      <div className="flex flex-col gap-2.5">
                        {item.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex flex-col gap-2 bg-[#f5f6fa] p-3.5 rounded-lg border border-[#c3c6d2]/20 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-brand-navy">{task.title}</span>
                              <StatusBadge
                                label={task.taskStatus}
                                tone={task.taskStatus === "COMPLETED" ? "success" : task.taskStatus === "IN_PROGRESS" ? "info" : "neutral"}
                              />
                            </div>
                            {task.description && (
                              <p className="text-xs text-brand-muted mt-0.5 leading-relaxed">{task.description}</p>
                            )}
                            <div className="grid grid-cols-2 gap-2.5 mt-2 border-t border-[#c3c6d2]/15 pt-2.5 text-xs text-brand-ink">
                              {task.project && (
                                <div className="col-span-2">
                                  <span className="font-semibold text-brand-muted mr-1">Project:</span>
                                  <span>{task.project.name}</span>
                                </div>
                              )}
                              <div>
                                <span className="font-semibold text-brand-muted block mb-0.5">Expected Output:</span>
                                <span className="text-[11px]">{task.expectedOutput || "—"}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-brand-muted block mb-0.5">Measurement:</span>
                                <span className="text-[11px]">{task.measurement || "—"}</span>
                              </div>
                              {(task.kpi || task.plannedTarget) && (
                                <div className="col-span-2 grid grid-cols-2 gap-2.5 mt-1 pt-1 border-t border-[#c3c6d2]/10">
                                  {task.kpi && (
                                    <div>
                                      <span className="font-semibold text-brand-muted block mb-0.5">KPI:</span>
                                      <span className="text-[11px]">{task.kpi}</span>
                                    </div>
                                  )}
                                  {task.plannedTarget && (
                                    <div>
                                      <span className="font-semibold text-brand-muted block mb-0.5">Planned Target:</span>
                                      <span className="text-[11px]">{task.plannedTarget}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-brand-ink bg-[#f5f6fa] p-3 rounded-lg border border-[#c3c6d2]/20 whitespace-pre-wrap">
                        {item.today || "No active tasks logged."}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Panel: Blockers & Supervisor remarks */}
                <div className="flex flex-col gap-4">
                  {/* Blockers */}
                  <div>
                    <h4 className="text-sm font-semibold text-brand-navy mb-1.5">Active Blockers / Issues</h4>
                    {item.blockerItems && item.blockerItems.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {item.blockerItems.map((blocker) => (
                          <li
                            key={blocker.id}
                            className="bg-red-50/50 border border-red-200/60 p-3 rounded-lg text-sm text-brand-ink"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-red-700">{blocker.title}</span>
                              <StatusBadge label={blocker.severity} tone="danger" />
                            </div>
                            <p className="text-xs text-red-600/90">{blocker.status}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-brand-muted bg-[#f5f6fa] p-3 rounded-lg border border-[#c3c6d2]/20">
                        No active blockers reported.
                      </p>
                    )}
                  </div>

                  {/* Comment & Feedback box */}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-brand-navy">Supervisor Comment</h4>
                    <textarea
                      placeholder="Add supervisor notes or feedback..."
                      value={commentDrafts[item.id] !== undefined ? commentDrafts[item.id] : item.supervisorNote ?? ""}
                      onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-full rounded-lg border border-[#c3c6d2] p-2.5 text-sm outline-none focus:border-brand min-h-[80px]"
                    />

                    <div className="flex items-center justify-between gap-3 mt-1">
                      <button
                        type="button"
                        onClick={() =>
                          commentMutation.mutate({
                            id: item.id,
                            comment: commentDrafts[item.id] || "",
                            version: item.version,
                          })
                        }
                        disabled={commentMutation.isPending || commentDrafts[item.id] === undefined}
                        className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                      >
                        {commentMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5" />
                        )}
                        Post Comment
                      </button>

                      <div className="flex items-center gap-2">
                        {item.isLocked ? (
                          <button
                            type="button"
                            onClick={() => {
                              setUnlockTarget({ id: item.id, name: `${item.user.firstName} ${item.user.lastName}` });
                              setUnlockReason("");
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            <LockOpen className="h-3.5 w-3.5" />
                            Unlock Commitment
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => flagMutation.mutate({ id: item.id, version: item.version })}
                          disabled={flagMutation.isPending || item.status === "BLOCKED"}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/50 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {flagMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Flag className="h-3.5 w-3.5" />
                          )}
                          Flag Recurring Issue
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 ? (
        <div className="flex items-center justify-between gap-2 mt-4 bg-white p-3 rounded-lg border border-[#c3c6d2]/30">
          <span className="text-sm text-brand-muted">
            Showing {items.length} of {total} team members
          </span>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded p-1.5 text-brand hover:bg-[#f5f6fa] disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-medium text-brand-navy">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded p-1.5 text-brand hover:bg-[#f5f6fa] disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <RecurringIssuesPanel />

      {/* Unlock Commitment modal */}
      {unlockTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2 text-amber-700">
              <LockOpen className="h-5 w-5" />
              <h3 className="text-lg font-semibold text-brand-navy">Unlock Today&apos;s Commitment</h3>
            </div>
            <p className="mt-2 text-sm text-brand-muted">
              This lets <span className="font-semibold text-brand-navy">{unlockTarget.name}</span> edit their locked
              commitment again. They&apos;ll be notified, and this action is recorded in the audit log.
            </p>

            <label className="mt-4 block text-sm font-semibold text-brand-navy">
              Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="e.g. Plan needs revision after scope change"
              className="mt-1.5 w-full rounded-lg border border-[#c3c6d2] p-2.5 text-sm outline-none focus:border-brand min-h-[80px]"
            />
            <p className="mt-1 text-xs text-brand-muted">
              Required — at least 5 characters. Recorded in the audit log.
            </p>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setUnlockTarget(null);
                  setUnlockReason("");
                }}
                disabled={unlockMutation.isPending}
                className="rounded-lg border border-[#c3c6d2] px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-[#f5f6fa] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => unlockMutation.mutate({ id: unlockTarget.id, reason: unlockReason.trim() })}
                disabled={unlockMutation.isPending || unlockReason.trim().length < 5}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {unlockMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
                Unlock
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
