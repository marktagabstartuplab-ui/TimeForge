"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SunsetIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { listTimeEntries } from "../api/time-entries.service";
import { listScrumEntries } from "@/features/scrum/api/scrum.service";
import { summarizeDay } from "../lib/day-summary";
import { TimerCard, clearBreakFlag } from "./TimerCard";
import { CurrentContextCard } from "./CurrentContextCard";
import { TimeEntryForm } from "./TimeEntryForm";
import { TodayEntriesList } from "./TodayEntriesList";
import { DailyScrumCard } from "./DailyScrumCard";
import { EodReviewModal } from "./EodReviewModal";
import { startOfDay, endOfDay, toIsoDate } from "@/lib/time";

export function TimeTrackingContent() {
  const [eodOpen, setEodOpen] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);
  const today = useMemo(() => new Date(), []);

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

  const scrumQuery = useQuery({
    queryKey: ["scrum-entries", "today"],
    queryFn: () => listScrumEntries({ from: toIsoDate(today), to: toIsoDate(today), limit: 1 }),
  });

  const entries = useMemo(() => entriesQuery.data?.data ?? [], [entriesQuery.data]);
  const summary = useMemo(() => summarizeDay(entries), [entries]);
  const scrumEntry = scrumQuery.data?.data[0] ?? null;

  // Most recent completed entry today — seeds "Resume Shift" context.
  const lastEntry = useMemo(() => {
    const completed = entries.filter((e) => e.endTime);
    if (completed.length === 0) return null;
    return completed.reduce((latest, e) => (e.endTime! > latest.endTime! ? e : latest));
  }, [entries]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Active Session"
        subtitle="Track time accurately for precise KPI alignment."
        action={
          <button
            type="button"
            onClick={() => setEodOpen(true)}
            className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4]"
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
          End of day review submitted — you&apos;re timed out. Starting the timer again reopens your day.
        </p>
      ) : null}

      {entriesQuery.isError ? (
        <ErrorState
          message="Could not load your time entries."
          onRetry={() => entriesQuery.refetch()}
        />
      ) : entriesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-56" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-[420px] lg:col-span-2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4">
            <TimerCard
              running={summary.running}
              lastEntry={lastEntry}
              loading={entriesQuery.isFetching}
              onTimeOut={() => setEodOpen(true)}
            />
            <CurrentContextCard summary={summary} />
          </div>
          <div className="lg:col-span-2">
            <TimeEntryForm />
          </div>
        </div>
      )}

      <TodayEntriesList entries={entries} />

      <DailyScrumCard entry={scrumEntry} />

      <EodReviewModal
        open={eodOpen}
        onOpenChange={setEodOpen}
        summary={summary}
        scrumEntry={scrumEntry}
        onSubmitted={() => {
          clearBreakFlag();
          setDayClosed(true);
        }}
      />
    </div>
  );
}
