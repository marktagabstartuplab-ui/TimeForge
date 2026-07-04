"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Building2, Clock3, Coffee, FolderKanban, Loader2, LogOut, Play, Timer } from "lucide-react";
import { startTimer, stopTimer, type TimeEntry } from "../api/time-entries.service";
import { listClients, listProjects } from "../api/catalog.service";
import { readBreakStart, setBreakStart, clearBreakFlag } from "../lib/break-flag";
import { splitDescription, type WorkTask } from "../lib/task-select";
import type { DaySummary } from "../lib/day-summary";
import { formatStopwatch, formatClockTime, formatMinutes } from "@/lib/time";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface CurrentSessionCardProps {
  /** Today's aggregate — running entry, first clock-in, break totals. */
  summary: DaySummary;
  /** Most recent completed entry today — its context seeds "Resume Shift". */
  lastEntry: TimeEntry | null;
  /** Quick Select choice — Clock In starts the session with this context. */
  selectedTask: WorkTask | null;
  loading: boolean;
  /** Opens the End of Day Review (the only path that stops AND reviews). */
  onTimeOut: () => void;
}

/**
 * Section 1 — Current Session. Wide banner card: cumulative stopwatch,
 * Clock In / Break / Resume / Time Out, and the live session context
 * (started at, working on, project, client) — all derived from the timer.
 */
export function CurrentSessionCard({
  summary,
  lastEntry,
  selectedTask,
  loading,
  onTimeOut,
}: CurrentSessionCardProps) {
  const running = summary.running;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: clients } = useQuery({ queryKey: ["catalog", "clients"], queryFn: listClients });

  const breakStart = readBreakStart();
  const onBreak = !running && Boolean(breakStart);

  useEffect(() => {
    if (!running && !onBreak) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, onBreak]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["time-entries"] });

  const clockIn = useMutation({
    // A Quick Select task seeds the new session's context.
    mutationFn: () =>
      startTimer(
        selectedTask
          ? {
              projectId: selectedTask.projectId ?? undefined,
              clientId: selectedTask.clientId ?? undefined,
              workCategoryId: selectedTask.workCategoryId ?? undefined,
              description: selectedTask.title,
            }
          : {},
      ),
    onSuccess: () => {
      clearBreakFlag();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("timeforge.session-accumulated-seconds", "0");
      }
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the shift"),
  });

  const takeBreak = useMutation({
    mutationFn: (id: string) => stopTimer(id),
    onSuccess: () => {
      setBreakStart(new Date().toISOString());
      if (typeof window !== "undefined" && running) {
        const segmentSeconds = Math.max(0, (Date.now() - new Date(running.startTime).getTime()) / 1000);
        const prev = parseFloat(window.localStorage.getItem("timeforge.session-accumulated-seconds") ?? "0");
        window.localStorage.setItem("timeforge.session-accumulated-seconds", (prev + segmentSeconds).toString());
      }
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not pause the session"),
  });

  const resume = useMutation({
    // Carry the interrupted session's context into the new entry.
    mutationFn: () =>
      startTimer({
        projectId: lastEntry?.projectId ?? undefined,
        clientId: lastEntry?.clientId ?? undefined,
        workCategoryId: lastEntry?.workCategoryId ?? undefined,
        description: lastEntry?.description ?? undefined,
      }),
    onSuccess: () => {
      clearBreakFlag();
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not resume the shift"),
  });

  // Read accumulated session seconds from localStorage.
  const accumulated = typeof window !== "undefined"
    ? parseFloat(window.localStorage.getItem("timeforge.session-accumulated-seconds") ?? "0")
    : 0;

  // Ticks while running; pauses/freezes at the accumulated time on break.
  const elapsedSeconds = running
    ? accumulated + Math.max(0, (now - new Date(running.startTime).getTime()) / 1000)
    : onBreak
      ? accumulated
      : 0;

  const breakSeconds = onBreak
    ? Math.max(0, (now - new Date(breakStart!).getTime()) / 1000)
    : 0;
  const breakStopwatch = formatStopwatch(breakSeconds);

  const pending = clockIn.isPending || takeBreak.isPending || resume.isPending;

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    (id && list?.find((item) => item.id === id)?.name) || null;

  const clockInAt = summary.clockInAt ?? running?.startTime ?? null;
  const currentTask = running ? splitDescription(running.description).task : "";
  const breakStatus = onBreak
    ? `On break — ${formatMinutes(Math.max(0, (now - new Date(breakStart!).getTime()) / 60_000))}`
    : summary.breakCount > 0
      ? `${formatMinutes(summary.breakMinutes)} (${summary.breakCount} ${summary.breakCount === 1 ? "break" : "breaks"})`
      : "No breaks yet";

  const infoTiles: { label: string; value: string; icon: React.ReactNode }[] = [
    {
      label: "Started At",
      value: clockInAt ? formatClockTime(clockInAt) : "—",
      icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    { label: "Break", value: breakStatus, icon: <Coffee className="h-3.5 w-3.5" aria-hidden="true" /> },
    {
      label: "Working on",
      value: currentTask || (running ? "General work" : "—"),
      icon: <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      label: "Project",
      value: nameOf(projects, running?.projectId ?? null) ?? "—",
      icon: <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      label: "Client",
      value: nameOf(clients, running?.clientId ?? null) ?? "—",
      icon: <Building2 className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  const btnBase =
    "flex h-11 items-center justify-center gap-2 rounded-[10px] px-6 text-sm font-bold transition-colors disabled:opacity-60";

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Timer block */}
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-bold uppercase tracking-[2px] text-brand">
          {running ? "Active Session" : onBreak ? "On Break" : "Current Session"}
        </p>
        <p
          aria-live="polite"
          className={cn(
            "font-mono text-[44px] font-bold tabular-nums leading-none tracking-tight",
            running ? "text-brand" : onBreak ? "text-amber-600" : "text-brand-muted/50",
          )}
        >
          {formatStopwatch(elapsedSeconds)}
        </p>
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted">
          <span
            aria-hidden="true"
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              running ? "animate-pulse bg-red-500" : onBreak ? "animate-pulse bg-amber-500" : "bg-[#c3c6d2]",
            )}
          />
          {running ? "Recording session" : onBreak ? `On break (${breakStopwatch})` : "Timer idle"}
        </span>

        {error ? (
          <p role="alert" className="w-full rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        ) : null}

        {/* Session controls */}
        <div className="flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row">
          {running ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  takeBreak.mutate(running.id);
                }}
                disabled={pending}
                className={cn(btnBase, "border border-[#c3c6d2]/60 bg-white text-brand-navy hover:bg-[#f6f3f4]")}
              >
                {takeBreak.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Coffee className="h-4 w-4" aria-hidden="true" />
                )}
                Take a Break
              </button>
              <button
                type="button"
                onClick={onTimeOut}
                disabled={pending}
                className={cn(btnBase, "bg-brand-navy text-white hover:bg-[#00394e]")}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Time Out &amp; Review
              </button>
            </>
          ) : onBreak ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  resume.mutate();
                }}
                disabled={pending || loading}
                className={cn(btnBase, "bg-brand text-white hover:bg-[#1467d6]")}
              >
                {resume.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                )}
                Resume Shift
              </button>
              <button
                type="button"
                onClick={onTimeOut}
                disabled={pending}
                className={cn(btnBase, "bg-brand-navy text-white hover:bg-[#00394e]")}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Time Out &amp; Review
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                clockIn.mutate();
              }}
              disabled={pending || loading}
              className={cn(btnBase, "bg-brand text-white hover:bg-[#1467d6]")}
            >
              {clockIn.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Timer className="h-4 w-4" aria-hidden="true" />
              )}
              Clock In
              {selectedTask ? ` — ${selectedTask.title}` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Live session context — only while a session or break is active. */}
      {running || onBreak ? (
        <>
          <div
            role="status"
            className={cn(
              "mt-5 rounded-[10px] px-4 py-3",
              running ? "bg-[#f0fdf4]" : "bg-amber-50",
            )}
          >
            <p className={cn("text-sm font-bold", running ? "text-[#16a34a]" : "text-amber-600")}>
              {running ? "Active Session in Progress" : `Session Paused — On Break (${breakStopwatch})`}
            </p>
            {clockInAt ? (
              <p className="mt-0.5 text-xs text-brand-muted">
                You timed in today at {formatClockTime(clockInAt)}.{" "}
                {running ? "Your work clock is running." : "Your work clock is paused."}
              </p>
            ) : null}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
            {infoTiles.map((tile) => (
              <div key={tile.label} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                  <span className="text-brand-muted/60">{tile.icon}</span>
                  {tile.label}
                </dt>
                <dd className="mt-0.5 truncate text-sm font-bold text-brand-ink" title={tile.value}>
                  {tile.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  );
}
