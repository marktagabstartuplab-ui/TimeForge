"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { SunsetIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { listTimeEntries, listAllTimeEntries } from "../api/time-entries.service";
import { getCurrentWorkSession } from "../api/work-sessions.service";
import { listScrumEntries, getScrumEntry, listScrumTasks } from "@/features/scrum/api/scrum.service";
import { getMe } from "@/features/account/api/account.service";
import { fetchDepartments } from "@/features/auth/api/auth.service";
import { summarizeDay } from "../lib/day-summary";
import { deriveTasks, type WorkTask } from "../lib/task-select";
import { CurrentSessionCard } from "./CurrentSessionCard";
import { ScrumTaskCard } from "./ScrumTaskCard";
import { WorkDetailsCard } from "./WorkDetailsCard";
import { QuickSelectRail } from "./QuickSelectRail";
import { TodayProgressCard } from "./TodayProgressCard";
import { TodayEntriesList } from "./TodayEntriesList";
import { ScrumHistoryCard } from "./ScrumHistoryCard";
import { SupervisorCommentBanner } from "./SupervisorCommentBanner";
import { EodReviewModal } from "./EodReviewModal";
import { startOfDay, endOfDay, toIsoDate, weekWindow } from "@/lib/time";

/**
 * Daily Scrum page — task-driven workflow. Main column: Current Session →
 * Daily Scrum card → Work Details → Today's Entries; right rail: Quick
 * Select + Today's Progress. All data comes from existing endpoints
 * (time-entries, scrum-entries, catalogs, users/me, dashboard/summary).
 */
export function TimeTrackingContent() {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("scrum");
  const [eodOpen, setEodOpen] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null);
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
        .filter((e) => e.supervisorNote && e.supervisorNote.trim().length > 0)
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate))[0] ?? null
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
  const canReviewDay = hasScrumPlan && entries.length > 0 && hasWorkDetails;
  const reviewBlockedReason = canReviewDay
    ? null
    : [
        !hasScrumPlan ? "save today's Daily Scrum commitments" : null,
        hasScrumPlan && entries.length === 0 ? "clock in and log some work" : null,
        entries.length > 0 && !hasWorkDetails
          ? "complete and save Work Details (task & description)"
          : null,
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

  const onToast = useCallback((t: ToastState) => setToast(t), []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily Scrum"
        subtitle="Run your session, plan today's tasks, and submit your scrum."
        action={
          <button
            type="button"
            onClick={() => setEodOpen(true)}
            disabled={!canReviewDay}
            title={canReviewDay ? undefined : reviewBlockedReason ?? undefined}
            className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            <SunsetIcon className="h-[18px] w-[18px] text-brand" aria-hidden="true" />
            End of Day Review
          </button>
        }
      />

      {dayClosed ? (
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
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          {/* Main column */}
          <div className="flex min-w-0 flex-col gap-4">
            <CurrentSessionCard
              selectedTask={selectedTask}
              runningTask={summary.running?.task ?? null}
              runningProjectId={summary.running?.projectId ?? null}
              runningClientId={summary.running?.clientId ?? null}
              loading={entriesQuery.isFetching}
              onTimeOut={() => setEodOpen(true)}
              reviewReady={canReviewDay}
              reviewBlockedReason={reviewBlockedReason}
            />

            <ScrumTaskCard
              entry={scrumEntry}
              loading={scrumQuery.isLoading}
              onToast={onToast}
            />

            <WorkDetailsCard
              key={editableEntry?.id ?? "idle"}
              running={editableEntry}
              selectedTask={selectedTask}
              profileDepartmentId={meQuery.data?.departmentId ?? null}
              departments={departmentsQuery.data ?? []}
              onToast={onToast}
            />

            <TodayEntriesList entries={entries} />

            <ScrumHistoryCard />
          </div>

          {/* Right rail */}
          <div className="flex min-w-0 flex-col gap-4">
            <QuickSelectRail
              tasks={tasks}
              loading={weekQuery.isLoading}
              onSelect={setSelectedTask}
              onToast={onToast}
            />
            <TodayProgressCard
              summary={summary}
              weekEntries={weekEntries}
              weekLoading={weekQuery.isLoading}
            />
            {latestFeedbackEntry ? (
              <SupervisorCommentBanner
                note={latestFeedbackEntry.supervisorNote!}
                entryDate={latestFeedbackEntry.entryDate}
                viewHref={`/time-tracking?scrum=${latestFeedbackEntry.id}`}
              />
            ) : null}
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
