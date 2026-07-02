"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Coffee, Loader2, LogIn, LogOut, Play } from "lucide-react";
import { startTimer, stopTimer, type TimeEntry } from "../api/time-entries.service";
import { formatStopwatch } from "@/lib/time";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Break state is client-side only — the backend has no break entity, so a
 * break is modelled as "stop the running entry, remember when, and start a
 * new entry with the same context on resume" (standard tracker pattern).
 * Persisted in localStorage so a reload doesn't lose the break clock.
 */
const BREAK_KEY = "timeforge.break-start";

function readBreakStart(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(BREAK_KEY);
}

/** Clears the client-side break flag (used when the day is closed via EOD review). */
export function clearBreakFlag(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(BREAK_KEY);
}

interface TimerCardProps {
  running: TimeEntry | null;
  /** Most recent completed entry today — its context seeds "Resume Shift". */
  lastEntry: TimeEntry | null;
  loading: boolean;
  /** Opens the End of Day Review (the only path that stops AND reviews). */
  onTimeOut: () => void;
}

/** Stopwatch widget: Time In → Active Session → Break → Resume → Time Out. */
export function TimerCard({ running, lastEntry, loading, onTimeOut }: TimerCardProps) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  // Read the flag on every render (this component is never server-rendered —
  // AppShell gates on the client session). Mutations below re-render via
  // query invalidation, so no mirror state is needed and it can't go stale.
  const breakStart = readBreakStart();

  // A running entry always wins over a stale break flag (e.g. after resuming
  // in another tab), so check `running` first everywhere below.
  const onBreak = !running && Boolean(breakStart);

  // Tick while a session or a break is in progress.
  useEffect(() => {
    if (!running && !onBreak) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, onBreak]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["time-entries"] });

  const timeIn = useMutation({
    mutationFn: () => startTimer(),
    onSuccess: () => {
      clearBreakFlag();
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the shift"),
  });

  const takeBreak = useMutation({
    mutationFn: (id: string) => stopTimer(id),
    onSuccess: () => {
      window.localStorage.setItem(BREAK_KEY, new Date().toISOString());
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

  const elapsedSeconds = running
    ? Math.max(0, (now - new Date(running.startTime).getTime()) / 1000)
    : onBreak
      ? Math.max(0, (now - new Date(breakStart!).getTime()) / 1000)
      : 0;

  const pending = timeIn.isPending || takeBreak.isPending || resume.isPending;

  return (
    <div className="flex flex-col items-center gap-5 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <p
        aria-live="polite"
        className={cn(
          "font-mono text-[44px] font-bold tabular-nums leading-none tracking-tight",
          running ? "text-brand-ink" : onBreak ? "text-amber-600" : "text-brand-muted/50",
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
        {running ? "Recording session" : onBreak ? "On break" : "Timer idle"}
      </span>

      {error ? (
        <p role="alert" className="w-full rounded-[8px] bg-red-50 px-3 py-2 text-center text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-3">
        {running ? (
          <>
            <button
              type="button"
              onClick={() => {
                setError(null);
                takeBreak.mutate(running.id);
              }}
              disabled={pending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-white text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:opacity-60"
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-navy text-sm font-bold text-white transition-colors hover:bg-[#00394e] disabled:opacity-60"
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-navy text-sm font-bold text-white transition-colors hover:bg-[#00394e] disabled:opacity-60"
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
              timeIn.mutate();
            }}
            disabled={pending || loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
          >
            {timeIn.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden="true" />
            )}
            Time In
          </button>
        )}
      </div>
    </div>
  );
}
