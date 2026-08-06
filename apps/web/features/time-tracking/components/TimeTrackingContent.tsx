"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, SunsetIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { listTimeEntries, listAllTimeEntries } from "../api/time-entries.service";
import { getCurrentWorkSession } from "../api/work-sessions.service";
import {
  listScrumEntries,
  getScrumEntry,
  listScrumTasks,
  getScrumCarryOver,
  dismissSupervisorComment,
  type ScrumTask,
} from "@/features/scrum/api/scrum.service";
import { ApiError } from "@/lib/api/client";
import { getMe } from "@/features/account/api/account.service";
import { fetchDepartments } from "@/features/auth/api/auth.service";
import { summarizeDay } from "../lib/day-summary";
import { deriveTasks, type ScrumPlanPrefill, type WorkTask } from "../lib/task-select";
import { SupervisorCommentBanner } from "./SupervisorCommentBanner";
import { EodReviewModal } from "./EodReviewModal";
import {
  TabNavigation,
  type ScrumTabDescriptor,
  type ScrumTabId,
} from "./scrum-tabs/TabNavigation";
import { ScrumProgressBar } from "./scrum-tabs/ScrumProgressBar";
import { PlanTab } from "./scrum-tabs/PlanTab";
import { WorkTab } from "./scrum-tabs/WorkTab";
import { ReviewTab } from "./scrum-tabs/ReviewTab";
import { SubmitTab } from "./scrum-tabs/SubmitTab";
import { startOfDay, endOfDay, toIsoDate, weekWindow } from "@/lib/time";

/** Ordered workflow steps; the active one is mirrored in `?step=`. */
const TAB_ORDER: ScrumTabId[] = ["plan", "work", "review", "submit"];

function parseTab(value: string | null): ScrumTabId {
  return TAB_ORDER.includes(value as ScrumTabId) ? (value as ScrumTabId) : "plan";
}

/**
 * Daily Scrum page — task-driven workflow, split into four steps (Plan → Work →
 * Review → Submit) so no single view requires long scrolling. All four panels
 * stay mounted and are toggled with `hidden`, so in-progress form state (the
 * planner draft, Work Details) survives switching steps. All data comes from
 * existing endpoints (time-entries, scrum-entries, catalogs, users/me,
 * dashboard/summary); the EOD submission itself still runs through
 * EodReviewModal untouched.
 */
export function TimeTrackingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const deepLinkId = searchParams.get("scrum");
  const activeTab = parseTab(searchParams.get("step"));

  // Steps live in the URL so browser Back moves between them (and a deep link
  // to a specific step is shareable). `scroll: false` keeps the tab bar in view.
  const goToTab = useCallback(
    (id: ScrumTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [eodOpen, setEodOpen] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null);
  // Quick Select also drives the Daily Scrum planner. Kept separate from
  // `selectedTask` because carried-over commitments are ScrumTasks, not
  // time-entry-derived WorkTasks, and they carry their own KPI/target fields.
  const [planPrefill, setPlanPrefill] = useState<ScrumPlanPrefill | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const today = useMemo(() => new Date(), []);
  const week = useMemo(() => weekWindow(today), [today]);

  const entriesQuery = useQuery({
    queryKey: ["time-entries", "today"],
    queryFn: () =>
      listTimeEntries({
        from: startOfDay(today).toISOString(),
        to: endOfDay(today).toISOString(),
        limit: 100,
      }),
    refetchInterval: 60_000,
  });

  // This week's entries feed Quick Select tasks and the progress chart.
  const weekQuery = useQuery({
    queryKey: ["time-entries", "week-all", toIsoDate(week.from)],
    queryFn: () =>
      listAllTimeEntries({ from: week.from.toISOString(), to: week.to.toISOString() }),
  });

  // A running entry can predate today (e.g. the user never timed out
  // yesterday) — today's window would miss it, showing "idle" while the
  // backend rejects new starts. Query it explicitly and fold it in.
  const runningQuery = useQuery({
    queryKey: ["time-entries", "running"],
    queryFn: () => listTimeEntries({ running: true, limit: 1 }),
  });

  const scrumQuery = useQuery({
    queryKey: ["scrum-entries", "today"],
    queryFn: () => listScrumEntries({ from: toIsoDate(today), to: toIsoDate(today), limit: 1 }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    // Belt-and-suspenders alongside the Realtime broadcast invalidation
    // (useNotificationsRealtime): if the websocket drops or a broadcast is
    // missed, a supervisor comment left while this tab sits open and focused
    // would otherwise never appear without a manual reload.
    refetchInterval: 60_000,
  });

  const deepLinkQuery = useQuery({
    queryKey: ["scrum-entries", deepLinkId],
    queryFn: () => getScrumEntry(deepLinkId!),
    enabled: Boolean(deepLinkId),
  });

  const workSessionQuery = useQuery({
    queryKey: ["work-session", "current"],
    queryFn: getCurrentWorkSession,
    refetchInterval: 30_000,
  });

  const meQuery = useQuery({ queryKey: ["users", "me"], queryFn: getMe });
  const departmentsQuery = useQuery({ queryKey: ["auth", "departments"], queryFn: fetchDepartments });

  const entries = useMemo(() => {
    const todays = entriesQuery.data?.data ?? [];
    const running = runningQuery.data?.data[0];
    if (running && !todays.some((e) => e.id === running.id)) return [...todays, running];
    return todays;
  }, [entriesQuery.data, runningQuery.data]);
  const weekEntries = useMemo(() => weekQuery.data ?? [], [weekQuery.data]);
  const summary = useMemo(() => summarizeDay(entries), [entries]);

  // Supervisor feedback often lands on a *past* day's entry (a supervisor
  // reviews yesterday's scrum today). Normal navigation only loads today's
  // entry, so that feedback was previously visible only by clicking the
  // notification deep link (?scrum=<id>). Reuse the history query (shared cache
  // key with ScrumHistoryCard) to find the most recent commented entry and
  // surface it as a standalone banner — unless it's the entry the card already
  // shows (today's, or the deep-linked one), which renders its own banner.
  const historyQuery = useQuery({
    queryKey: ["scrum-entries", "history"],
    queryFn: () => listScrumEntries({ limit: 30 }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const scrumEntry = useMemo(() => {
    const base = deepLinkId ? (deepLinkQuery.data ?? null) : (scrumQuery.data?.data[0] ?? null);
    if (!base) return null;
    if (base.supervisorNote?.trim()) return base;

    const noted = (historyQuery.data?.data ?? []).find(
      (e) => e.id === base.id && e.supervisorNote?.trim(),
    );
    return noted ? { ...base, supervisorNote: noted.supervisorNote } : base;
  }, [deepLinkId, deepLinkQuery.data, scrumQuery.data, historyQuery.data]);
  const onBreak = workSessionQuery.data?.onBreak ?? false;

  const latestFeedbackEntry = useMemo(() => {
    const all = historyQuery.data?.data ?? [];
    return (
      [...all]
        // Dismissed comments drop off the active dashboard but stay on the
        // record — Daily Scrum History still renders them (BUG-AR).
        .filter(
          (e) => e.supervisorNote && e.supervisorNote.trim().length > 0 && !e.supervisorNoteDismissedAt,
        )
        // Sort by when the comment was actually posted (updatedAt), not which
        // scrum day it's attached to (entryDate). A supervisor can comment on
        // an older backlogged entry after already commenting on a newer one —
        // sorting by entryDate would keep showing the newer entry's stale
        // comment forever, hiding the one that was just posted.
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    );
  }, [historyQuery.data]);

  // Today's plan lives in ScrumTask rows (task-driven flow) — the legacy
  // free-text `today` field is created empty, so it can't be the gate. Same
  // query key as ScrumTaskCard, so this is served from the shared cache.
  const scrumTasksQuery = useQuery({
    queryKey: ["scrum-tasks", scrumEntry?.id],
    queryFn: () => listScrumTasks(scrumEntry!.id),
    enabled: Boolean(scrumEntry),
  });

  // Work Details must stay editable while clocked in — including on break, when
  // the backend has stopped the running entry (QA #16). Fall back to today's most
  // recent entry so the card doesn't lock the moment a break starts.
  const editableEntry = useMemo(() => {
    if (summary.running) return summary.running;
    if (!onBreak) return null;
    return [...entries].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    )[0] ?? null;
  }, [summary.running, onBreak, entries]);

  const queryClient = useQueryClient();

  // Dismissing clears the banner from the active workspace only — the comment
  // stays on the entry and is still shown in Daily Scrum History (BUG-AR).
  const dismissComment = useMutation({
    mutationFn: (entryId: string) => dismissSupervisorComment(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
      setToast({ message: "Comment dismissed — still available in your scrum history." });
    },
    onError: (err) =>
      setToast({
        message: err instanceof ApiError ? err.message : "Could not dismiss the comment",
        tone: "error",
      }),
  });

  // Always refetch scrum data when opening Daily Scrum so supervisor comments
  // appear without requiring a notification deep link first.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
  }, [queryClient]);

  // If a notification deep link is clicked, it fetches fresh data for that specific
  // entry. When the user later navigates back to the normal view (sidebar), the
  // regular queries ("today" and "history") would be stale. We invalidate them
  // here so they refetch and pick up the new supervisor comments.
  useEffect(() => {
    if (deepLinkQuery.data) {
      queryClient.invalidateQueries({ queryKey: ["scrum-entries", "history"] });
      queryClient.invalidateQueries({ queryKey: ["scrum-entries", "today"] });
    }
  }, [deepLinkQuery.data, queryClient]);

  // EOD Review ("End of Day Review" header button and "Time Out & Review" in
  // CurrentSessionCard — the same action, two entry points) is only meaningful
  // once the day's plan is committed, work has started, AND Work Details are
  // saved for the current session (QA: employees could time out with Daily
  // Scrum/Work Details still empty). Single source of truth reused by both
  // buttons so they can never disagree.
  //
  // Plan committed = today's entry has at least one planned task (or legacy
  // free-text `today` content from before the task-driven flow).
  const scrumTasks = scrumTasksQuery.data ?? [];
  const hasScrumPlan =
    Boolean(scrumEntry) && (scrumTasks.length > 0 || Boolean(scrumEntry?.today));
  // All tasks completed = scrum is 100% done. When that's the case, we don't
  // require Work Details to be filled in on the current running entry — the
  // employee has demonstrably finished their commitments (QA: previously this
  // permanently blocked EOD even after 100% task completion).
  const allTasksCompleted =
    scrumTasks.length > 0 && scrumTasks.every((t) => t.taskStatus === "COMPLETED");
  const scrumIsLocked = scrumEntry?.isLocked ?? (scrumEntry?.status === "COMPLETED");
  const hasWorkDetails =
    allTasksCompleted ||
    scrumIsLocked ||
    Boolean(editableEntry?.task?.trim() && editableEntry?.description?.trim());
  // A submitted review is finished. Both EOD entry points used to stay live
  // afterwards — and submitting locks the scrum, which *satisfies* the
  // hasWorkDetails gate above, so the button got easier to press once the day
  // was already closed. Re-submitting overwrites the recorded accomplishments,
  // blockers and actuals. The submit stamps an "EOD Review —" line into the
  // entry's `today` (the modal itself splits on it), so that line is the
  // durable "already reviewed" marker across reloads; `dayClosed` covers the
  // moment between submit and refetch.
  const alreadyReviewed = dayClosed || Boolean(scrumEntry?.today?.includes("EOD Review —"));
  const canReviewDay = hasScrumPlan && entries.length > 0 && !alreadyReviewed;
  const reviewBlockedReason = canReviewDay
    ? null
    : alreadyReviewed
      ? "You've already submitted today's end of day review."
      : [
          !hasScrumPlan ? "save today's Daily Scrum commitments" : null,
          hasScrumPlan && entries.length === 0 ? "clock in and log some work" : null,
        ]
          .filter((r): r is string => Boolean(r))
          .reduce((sentence, part, i, arr) => {
            if (i === 0) return `Please ${part}`;
            return i === arr.length - 1 ? `${sentence}, and ${part}` : `${sentence}, ${part}`;
          }, "") + " before ending your day."

  const departmentName = useMemo(() => {
    const id = meQuery.data?.departmentId;
    return (id && departmentsQuery.data?.find((d) => d.id === id)?.name) || null;
  }, [meQuery.data, departmentsQuery.data]);

  // Distinct recent tasks (this week) for Quick Select.
  const tasks = useMemo(() => deriveTasks(weekEntries), [weekEntries]);

  // Commitments the user said they'd continue in a previous EOD review.
  const carryOverQuery = useQuery({
    queryKey: ["scrum-carry-over"],
    queryFn: getScrumCarryOver,
    refetchOnMount: "always",
  });

  const onToast = useCallback((t: ToastState) => setToast(t), []);

  // Every pick bumps `seq` so re-clicking the same card re-applies the prefill.
  const handleSelectTask = useCallback((task: WorkTask) => {
    setSelectedTask(task);
    setPlanPrefill((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      title: task.title,
      projectId: task.projectId ?? undefined,
    }));
  }, []);

  const handleSelectCarryOver = useCallback((task: ScrumTask) => {
    setPlanPrefill((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      title: task.title,
      expectedOutput: task.expectedOutput,
      measurement: task.measurement,
      kpi: task.kpi ?? undefined,
      kpiTemplateId: task.kpiTemplateId ?? undefined,
      plannedTarget: task.plannedTarget ?? undefined,
      projectId: task.projectId ?? undefined,
      carriedOverFrom: carryOverQuery.data?.sourceDate ?? undefined,
    }));
  }, [carryOverQuery.data]);

  // Step completion drives both the progress bar and the tab badges.
  const planDone = hasScrumPlan;
  const workDone = entries.length > 0 && hasWorkDetails;
  const reviewDone = alreadyReviewed;
  const submitDone = alreadyReviewed;
  const doneByTab: Record<ScrumTabId, boolean> = {
    plan: planDone,
    work: workDone,
    review: reviewDone,
    submit: submitDone,
  };
  const completedSteps = TAB_ORDER.filter((id) => doneByTab[id]).length;

  const tabs: ScrumTabDescriptor[] = [
    { id: "plan", shortLabel: "1. Plan", label: "Plan your day", status: "pending" },
    { id: "work", shortLabel: "2. Work", label: "Log your work", status: "pending" },
    { id: "review", shortLabel: "3. Review", label: "End of day review", status: "pending" },
    { id: "submit", shortLabel: "4. Submit", label: "Submit for approval", status: "pending" },
  ].map((tab) => {
    const id = tab.id as ScrumTabId;
    // "Locked" is advisory only — the tab stays clickable, the badge explains
    // why the step can't be finished yet.
    const locked =
      (id === "work" && !planDone) ||
      (id === "review" && !workDone) ||
      (id === "submit" && !canReviewDay && !alreadyReviewed);
    return {
      ...tab,
      id,
      status: doneByTab[id] ? "done" : id === activeTab ? "current" : locked ? "locked" : "pending",
    } as ScrumTabDescriptor;
  });

  const activeIndex = TAB_ORDER.indexOf(activeTab);
  const activeTabMeta = tabs[activeIndex];

  const submitChecklist = [
    { label: "Planned today's commitments", done: planDone },
    { label: `Logged ${summary.entryCount} work ${summary.entryCount === 1 ? "session" : "sessions"}`, done: entries.length > 0 },
    { label: "Completed the end of day review", done: alreadyReviewed },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily Scrum"
        subtitle="Run your session, plan today's tasks, and submit your scrum."
        action={
          <button
            type="button"
            onClick={() => {
              goToTab("review");
              setEodOpen(true);
            }}
            disabled={!canReviewDay}
            title={canReviewDay ? undefined : reviewBlockedReason ?? undefined}
            className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            <SunsetIcon className="h-[18px] w-[18px] text-brand" aria-hidden="true" />
            {alreadyReviewed ? "Day Reviewed" : "End of Day Review"}
          </button>
        }
      />

      {/* Survives a reload now — keyed on the entry's stored EOD marker, not
          just this session's submit. */}
      {alreadyReviewed ? (
        <p
          role="status"
          className="rounded-[12px] border border-[#16a34a]/30 bg-[#f0fdf4] px-4 py-3 text-sm font-medium text-[#16a34a]"
        >
          End of day review submitted — you&apos;re timed out. See you tomorrow!
        </p>
      ) : null}

      {entriesQuery.isError ? (
        <ErrorState
          message="Could not load your time entries."
          onRetry={() => entriesQuery.refetch()}
        />
      ) : entriesQuery.isLoading || scrumQuery.isLoading || historyQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-72" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {latestFeedbackEntry ? (
            <SupervisorCommentBanner
              note={latestFeedbackEntry.supervisorNote!}
              entryDate={latestFeedbackEntry.entryDate}
              viewHref={`/time-tracking?scrum=${latestFeedbackEntry.id}`}
              onDismiss={() => dismissComment.mutate(latestFeedbackEntry.id)}
              dismissing={dismissComment.isPending}
            />
          ) : null}

          <ScrumProgressBar completed={completedSteps} total={TAB_ORDER.length} />

          <TabNavigation tabs={tabs} active={activeTab} onSelect={goToTab} />

          {/* Every panel stays mounted (hidden, not unmounted) so unsaved
              planner / Work Details input survives switching steps. */}
          <div
            role="tabpanel"
            id="scrum-panel-plan"
            aria-labelledby="scrum-tab-plan"
            hidden={activeTab !== "plan"}
          >
            <PlanTab
              scrumEntry={scrumEntry}
              loading={scrumQuery.isLoading}
              prefill={planPrefill}
              onToast={onToast}
              tasks={tasks}
              tasksLoading={weekQuery.isLoading}
              onSelectTask={handleSelectTask}
              carryOver={carryOverQuery.data?.tasks ?? []}
              carryOverDate={carryOverQuery.data?.sourceDate ?? null}
              onSelectCarryOver={handleSelectCarryOver}
            />
          </div>

          <div
            role="tabpanel"
            id="scrum-panel-work"
            aria-labelledby="scrum-tab-work"
            hidden={activeTab !== "work"}
          >
            <WorkTab
              summary={summary}
              entries={entries}
              entriesFetching={entriesQuery.isFetching}
              weekEntries={weekEntries}
              weekLoading={weekQuery.isLoading}
              selectedTask={selectedTask}
              editableEntry={editableEntry}
              profileDepartmentId={meQuery.data?.departmentId ?? null}
              departments={departmentsQuery.data ?? []}
              plannedTasks={scrumTasks}
              onToast={onToast}
              onTimeOut={() => {
                goToTab("review");
                setEodOpen(true);
              }}
              reviewReady={canReviewDay}
              reviewBlockedReason={reviewBlockedReason}
            />
          </div>

          <div
            role="tabpanel"
            id="scrum-panel-review"
            aria-labelledby="scrum-tab-review"
            hidden={activeTab !== "review"}
          >
            <ReviewTab
              summary={summary}
              commitments={scrumTasks}
              onOpenReview={() => setEodOpen(true)}
              reviewReady={canReviewDay}
              reviewBlockedReason={reviewBlockedReason}
              alreadyReviewed={alreadyReviewed}
            />
          </div>

          <div
            role="tabpanel"
            id="scrum-panel-submit"
            aria-labelledby="scrum-tab-submit"
            hidden={activeTab !== "submit"}
          >
            <SubmitTab
              checklist={submitChecklist}
              onOpenReview={() => setEodOpen(true)}
              reviewReady={canReviewDay}
              reviewBlockedReason={reviewBlockedReason}
              alreadyReviewed={alreadyReviewed}
            />
          </div>

          {/* Step footer — 44px touch targets, shared by all four panels. */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goToTab(TAB_ORDER[activeIndex - 1])}
              disabled={activeIndex === 0}
              className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <ArrowLeftIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              Back
            </button>
            <span className="truncate text-xs font-semibold uppercase tracking-[1px] text-brand-muted">
              {activeTabMeta.label}
            </span>
            <button
              type="button"
              onClick={() => goToTab(TAB_ORDER[activeIndex + 1])}
              disabled={activeIndex === TAB_ORDER.length - 1}
              className="flex h-11 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-colors hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ArrowRightIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <EodReviewModal
        open={eodOpen}
        onOpenChange={setEodOpen}
        summary={summary}
        scrumEntry={scrumEntry}
        onSubmitted={() => setDayClosed(true)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
