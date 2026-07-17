"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Banknote, Clock3, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listTimeEntries } from "@/features/time-tracking/api/time-entries.service";
import { listProjects } from "@/features/time-tracking/api/catalog.service";
import {
  attachEntries,
  createTimesheet,
  getTimesheetDetail,
  listTimesheets,
  submitTimesheet,
  updateTimesheet,
  downloadTimesheetPdf,
  type Timesheet,
} from "../api/timesheets.service";
import { summarizePeriod } from "../lib/period-summary";
import { EntryAuditTable } from "./EntryAuditTable";
import { MyTimesheetCard } from "./MyTimesheetCard";
import { SubmitApprovalCard } from "./SubmitApprovalCard";
import { TimesheetHistoryCard } from "./TimesheetHistoryCard";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { DayTimelineCard } from "./DayTimelineCard";
import {
  currentPayPeriod,
  endOfDay,
  formatMinutesClock,
  formatPeriodRange,
  minutesToHours,
  startOfDay,
  toIsoDate,
} from "@/lib/time";
import { ApiError } from "@/lib/api/client";
import { summarizeDay, buildDayTimeline } from "@/features/time-tracking/lib/day-summary";
import { getCurrentWorkSession } from "@/features/time-tracking/api/work-sessions.service";

export function TimesheetsContent() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const period = useMemo(() => currentPayPeriod(now), [now]);
  const periodDayCount = Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1;

  // ── Today's entries (for Session Summary + Timeline) ──────────────────────
  const todayEntriesQuery = useQuery({
    queryKey: ["time-entries", "today", toIsoDate(now)],
    queryFn: () =>
      listTimeEntries({
        from: startOfDay(now).toISOString(),
        to: endOfDay(now).toISOString(),
        limit: 100,
      }),
  });

  // ── Period entries (for audit table + metric cards) ───────────────────────
  const timesheetsQuery = useQuery({
    queryKey: ["timesheets", "current-period"],
    queryFn: () =>
      listTimesheets({ from: toIsoDate(period.start), to: toIsoDate(period.start), limit: 5 }),
  });

  const entriesQuery = useQuery({
    queryKey: ["time-entries", "period", toIsoDate(period.start)],
    queryFn: () =>
      listTimeEntries({
        from: period.start.toISOString(),
        to: endOfDay(period.end).toISOString(),
        limit: 100,
      }),
  });

  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });

  const timesheet: Timesheet | null = timesheetsQuery.data?.data[0] ?? null;

  // Only fetched when rejected — that's the one state where the employee needs
  // to see the supervisor's remark. Approval history isn't in the list response.
  const timesheetDetailQuery = useQuery({
    queryKey: ["timesheets", "detail", timesheet?.id],
    queryFn: () => getTimesheetDetail(timesheet!.id),
    enabled: Boolean(timesheet?.id) && timesheet?.status === "REJECTED",
  });
  const latestRejection = timesheetDetailQuery.data?.approvals.find(
    (a) => a.resultingState === "REJECTED",
  );

  // ── Period-level aggregation ───────────────────────────────────────────────
  const entries = useMemo(() => entriesQuery.data?.data ?? [], [entriesQuery.data]);
  const summary = useMemo(
    () => summarizePeriod(entries, projects, period.start, period.end, now),
    [entries, projects, period, now],
  );

  // ── Today-level aggregation (Session Summary + Timeline) ──────────────────
  const todayEntries = useMemo(
    () => todayEntriesQuery.data?.data ?? [],
    [todayEntriesQuery.data],
  );
  const workSessionQuery = useQuery({
    queryKey: ["work-session", "current"],
    queryFn: getCurrentWorkSession,
  });
  const onBreak = workSessionQuery.data?.onBreak ?? false;

  const daySummary = useMemo(() => summarizeDay(todayEntries, now), [todayEntries, now]);
  const timeline = useMemo(() => buildDayTimeline(todayEntries, onBreak), [todayEntries, onBreak]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  /** Draft timesheet for the period, creating it on first save/submit. */
  const ensureTimesheet = async (): Promise<Timesheet> => {
    if (timesheet) return timesheet;
    return createTimesheet({
      periodStart: toIsoDate(period.start),
      periodEnd: toIsoDate(period.end),
    });
  };

  /**
   * Attach completed, not-yet-attached period entries to the draft. Only valid
   * for a DRAFT sheet (the API rejects attaching to any other status) — a
   * REJECTED/REVISION_REQUESTED resubmit reuses the entries already attached
   * from its original submission instead of pulling in newly-loose ones.
   */
  const attachLooseEntries = async (sheet: Timesheet): Promise<Timesheet> => {
    if (sheet.status !== "DRAFT") return sheet;
    const loose = entries.filter((e) => e.endTime && !e.timesheetId).map((e) => e.id);
    if (loose.length === 0) return sheet;
    return attachEntries(sheet.id, loose);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    queryClient.invalidateQueries({ queryKey: ["time-entries"] });
  };

  const saveDraft = useMutation({
    mutationFn: async (notes: string) => {
      let sheet = await ensureTimesheet();
      sheet = await attachLooseEntries(sheet);
      if (notes.trim()) {
        sheet = await updateTimesheet(sheet.id, { summary: notes.trim(), version: sheet.version });
      }
      return sheet;
    },
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Could not save the draft"),
  });

  const submit = useMutation({
    mutationFn: async (notes: string) => {
      let sheet = await ensureTimesheet();
      sheet = await attachLooseEntries(sheet);
      return submitTimesheet(sheet.id, {
        summary: notes.trim() || undefined,
        version: sheet.version,
      });
    },
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Could not submit the timesheet"),
  });

  const downloadPdfMutation = useMutation({
    mutationFn: () => {
      if (!timesheet) return Promise.reject(new Error("No timesheet generated yet."));
      return downloadTimesheetPdf(timesheet.id);
    },
    onSuccess: () => setActionError(null),
    onError: (err: any) =>
      setActionError(err instanceof ApiError ? err.message : (err?.message || "PDF download failed.")),
  });

  const loading = timesheetsQuery.isLoading || entriesQuery.isLoading;
  const todayLoading = todayEntriesQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Smart Timesheet"
        subtitle="Your session data is recorded automatically. Review and add your work summary below."
        action={
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={!timesheet || downloadPdfMutation.isPending}
                  onClick={() => downloadPdfMutation.mutate()}
                  className="flex h-11 items-center gap-2 rounded-[10px] border border-brand bg-white px-5 text-sm font-bold text-brand hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadPdfMutation.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  ) : (
                    <Download className="h-[18px] w-[18px]" aria-hidden="true" />
                  )}
                  Download PDF
                </button>
              }
            />
            <TooltipContent>
              {timesheet ? "Download a PDF copy of this timesheet" : "Save draft or submit timesheet to enable PDF download"}
            </TooltipContent>
          </Tooltip>
        }
      />

      {/* ── Session Summary Card (today's auto-generated session) ───────────── */}
      <SessionSummaryCard
        summary={daySummary}
        onBreak={onBreak}
        loading={todayLoading}
      />

      {/* ── Daily Activity Timeline ────────────────────────────────────────── */}
      <DayTimelineCard events={timeline} loading={todayLoading} />

      {/* ── Period Metric Cards ────────────────────────────────────────────── */}
      {entriesQuery.isError ? (
        <ErrorState message="Could not load this period's entries." onRetry={() => entriesQuery.refetch()} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Current period card */}
          <div className="flex flex-col gap-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            <p className="text-xs font-bold uppercase tracking-[0.6px] text-brand">Current Period</p>
            <p className="text-xl font-bold text-brand-ink">
              {formatPeriodRange(period.start, period.end)}
            </p>
            <p className="text-[34px] font-bold leading-none text-brand">
              {minutesToHours(summary.totalMinutes).toFixed(1)}
              <span className="ml-1 text-base font-normal text-brand-muted">hrs</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-brand-muted">Regular Hours</span>
              <span className="font-bold text-brand-ink">
                {minutesToHours(summary.regularMinutes).toFixed(1)} hrs
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-brand-muted">Overtime</span>
              <span className="font-bold text-brand">
                {minutesToHours(summary.overtimeMinutes).toFixed(1)} hrs
              </span>
            </div>
            <ProgressBar percent={summary.targetPercent} label="Period target progress" className="mt-1" />
            <p className="text-right text-xs text-brand-muted">
              {Math.min(summary.targetPercent, 100)}% of period target met
            </p>
          </div>

          <MetricCard
            icon={Clock3}
            label="Total Hours Today"
            value={formatMinutesClock(summary.todayMinutes)}
            caption={
              <div className="flex flex-col gap-1.5">
                <span>Vs. Target (8h)</span>
                <ProgressBar
                  percent={(summary.todayMinutes / (8 * 60)) * 100}
                  label="Today vs 8h target"
                />
              </div>
            }
          />

          <MetricCard
            icon={Banknote}
            label="Billable Hours"
            value={formatMinutesClock(summary.billableMinutes)}
            caption={
              summary.totalMinutes > 0
                ? `${Math.round((summary.billableMinutes / summary.totalMinutes) * 100)}% of total time`
                : "No hours yet"
            }
          />

          <MetricCard
            icon={Ban}
            iconTone="bg-red-50 text-red-500"
            label="Non-Billable Hours"
            value={formatMinutesClock(summary.nonBillableMinutes)}
            caption="Entries without a billable project"
          />
        </div>
      )}

      {/* ── My Timesheet (per-day smart view: stats, range, search, CSV) ──── */}
      <MyTimesheetCard />

      {/* ── Entry Audit Table (period, read-only from the system) ─────────── */}
      <EntryAuditTable
        entries={entries}
        overtimeDays={summary.overtimeDays}
        periodDayCount={periodDayCount}
      />

      {/* ── Submit for Approval (human-input: summary, accomplishments, blockers) */}
      <SubmitApprovalCard
        timesheet={timesheet}
        periodEndLabel={period.end.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        submitting={submit.isPending}
        savingDraft={saveDraft.isPending}
        error={actionError}
        rejectionRemark={latestRejection?.remark ?? null}
        rejectionBy={
          latestRejection?.supervisor
            ? `${latestRejection.supervisor.firstName} ${latestRejection.supervisor.lastName}`
            : null
        }
        onSubmit={(notes) => {
          setActionError(null);
          submit.mutate(notes);
        }}
        onSaveDraft={(notes) => {
          setActionError(null);
          saveDraft.mutate(notes);
        }}
      />

      {/* ── History ───────────────────────────────────────────────────────── */}
      <TimesheetHistoryCard />
    </div>
  );
}
