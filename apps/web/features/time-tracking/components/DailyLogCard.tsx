"use client";
import { useQuery } from "@tanstack/react-query";
import { Coffee, ListChecks, LogIn, LogOut, Play, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrentWorkSession,
  getDailyLog,
  type SessionEvent,
  type SessionEventType,
} from "../api/work-sessions.service";
import { formatClockTime, todayInOrgTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";

const EVENT_META: Record<
  SessionEventType,
  { label: string; icon: React.ReactNode; dot: string; text: string }
> = {
  CLOCK_IN: {
    label: "Clocked In",
    icon: <LogIn className="h-3.5 w-3.5" aria-hidden="true" />,
    dot: "bg-[#16a34a]",
    text: "text-[#16a34a]",
  },
  BREAK_START: {
    label: "Started Break",
    icon: <Coffee className="h-3.5 w-3.5" aria-hidden="true" />,
    dot: "bg-amber-500",
    text: "text-amber-600",
  },
  BREAK_END: {
    label: "Resumed Work",
    icon: <Play className="h-3.5 w-3.5" aria-hidden="true" />,
    dot: "bg-brand",
    text: "text-brand",
  },
  TASK_COMPLETED: {
    label: "Completed a Task",
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
    dot: "bg-brand-cyan",
    text: "text-brand",
  },
  CLOCK_OUT: {
    label: "Clocked Out",
    icon: <LogOut className="h-3.5 w-3.5" aria-hidden="true" />,
    dot: "bg-brand-navy",
    text: "text-brand-navy",
  },
};

/** Auto-closes (shift limit, midnight rollover) carry this in their metadata. */
function autoClosedReason(event: SessionEvent): string | null {
  const meta = event.metadata;
  if (typeof meta !== "object" || meta === null) return null;
  const record = meta as Record<string, unknown>;
  if (record.autoClosed !== true) return null;
  return record.reason === "shift_limit"
    ? "closed automatically at your shift limit"
    : record.reason === "day_rollover"
      ? "closed automatically at end of day"
      : "closed automatically";
}

/**
 * BUG-BW — Daily Log. A chronological, read-only timeline of every clock event
 * the server recorded today: time in, each break, each resume, time out.
 *
 * Read-only is the feature, not an omission — an attendance dispute is only
 * worth anything if the employee can't have edited the record. Every timestamp
 * here is `SessionEvent.occurredAt`, written server-side; the client never
 * sends one and there is no endpoint that edits or deletes an event.
 */
export function DailyLogCard() {
  const date = todayInOrgTimeZone();

  // Shared cache with CurrentSessionCard (same key), so this costs no extra
  // request — it is read purely to know *when* the log has changed.
  const { data: workSession } = useQuery({
    queryKey: ["work-session", "current"],
    queryFn: getCurrentWorkSession,
  });

  // Every clock action invalidates work-session/current, which moves one of
  // these fields, which moves this key — so the log refreshes the moment a
  // button is pressed without the session controls having to know we exist.
  const signature = [
    workSession?.session?.id ?? "none",
    workSession?.session?.isActive ?? false,
    workSession?.session?.breakCount ?? 0,
    workSession?.session?.currentBreakStartedAt ?? "none",
    workSession?.session?.clockOut ?? "none",
  ].join("|");

  const { data, isLoading } = useQuery({
    queryKey: ["work-session", "daily-log", date, signature],
    queryFn: () => getDailyLog(date),
    // Keeps the previous day's rows on screen while a new key resolves rather
    // than flashing the skeleton on every clock action.
    placeholderData: (previous) => previous,
  });

  const events = data?.events ?? [];

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#c3c6d2]/40 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-brand-cyan/20 text-brand">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xl text-brand-navy">Daily Log</h3>
            <p className="text-xs text-brand-muted">
              Every clock event recorded today, in order.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#f6f3f4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-brand-muted">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          Read-only · server time
        </span>
      </div>

      {isLoading && events.length === 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="mt-4 rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-xs text-brand-muted">
          Nothing logged yet today — your clock in, breaks and clock out will appear here as they
          happen.
        </p>
      ) : (
        <ol aria-live="polite" className="mt-4 flex flex-col">
          {events.map((event, idx) => {
            const meta = EVENT_META[event.eventType];
            const autoNote = autoClosedReason(event);
            const isLast = idx === events.length - 1;
            return (
              <li key={event.id} className="flex gap-3">
                {/* Rail: dot + connector to the next event. */}
                <div className="flex w-4 shrink-0 flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)}
                  />
                  {!isLast ? (
                    <span aria-hidden="true" className="w-px flex-1 bg-[#c3c6d2]/50" />
                  ) : null}
                </div>

                <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p
                      className={cn(
                        "flex items-center gap-1.5 text-sm font-bold",
                        meta.text,
                      )}
                    >
                      <span className="text-brand-muted/60">{meta.icon}</span>
                      {meta.label}
                    </p>
                    <time
                      dateTime={event.occurredAt}
                      className="font-mono text-sm font-bold tabular-nums text-brand-ink"
                    >
                      {formatClockTime(event.occurredAt)}
                    </time>
                  </div>
                  {autoNote ? (
                    <p className="mt-0.5 text-[11px] text-brand-muted">{autoNote}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
