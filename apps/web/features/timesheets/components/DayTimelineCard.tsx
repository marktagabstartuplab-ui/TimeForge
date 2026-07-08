"use client";

import { Clock3, Coffee, LogIn, LogOut, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent, TimelineEventKind } from "@/features/time-tracking/lib/day-summary";
import { formatClockTime, formatMinutes } from "@/lib/time";

const KIND_META: Record<
  TimelineEventKind,
  { icon: React.ReactNode; color: string; dotColor: string; lineColor: string }
> = {
  "clock-in": {
    icon: <LogIn className="h-4 w-4" aria-hidden="true" />,
    color: "bg-brand-cyan/20 text-brand",
    dotColor: "bg-brand",
    lineColor: "bg-brand/30",
  },
  break: {
    icon: <Coffee className="h-4 w-4" aria-hidden="true" />,
    color: "bg-amber-50 text-amber-600",
    dotColor: "bg-amber-500",
    lineColor: "bg-amber-200",
  },
  "clock-out": {
    icon: <LogOut className="h-4 w-4" aria-hidden="true" />,
    color: "bg-[#f0fdf4] text-[#16a34a]",
    dotColor: "bg-[#16a34a]",
    lineColor: "bg-[#bbf7d0]",
  },
  running: {
    icon: <Zap className="h-4 w-4 animate-pulse" aria-hidden="true" />,
    color: "bg-[#f0fdf4] text-[#16a34a]",
    dotColor: "bg-[#16a34a] animate-pulse",
    lineColor: "bg-[#bbf7d0]",
  },
};

/** "10:30 AM – 10:45 AM" for grouped breaks; "Now" for the live session. */
function timeLabel(event: TimelineEvent): string {
  if (event.kind === "running") return "Now";
  if (event.kind === "break") {
    return `${formatClockTime(event.at)} – ${event.endAt ? formatClockTime(event.endAt) : "now"}`;
  }
  return formatClockTime(event.at);
}

interface DayTimelineCardProps {
  events: TimelineEvent[];
  loading: boolean;
}

/** Read-only daily activity timeline — derived from session boundaries, no manual input. */
export function DayTimelineCard({ events, loading }: DayTimelineCardProps) {
  return (
    <div className="flex flex-col gap-0 rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between px-[25px] pt-[25px] pb-5">
        <h3 className="text-xl text-brand-navy">Today&apos;s Activity Timeline</h3>
        <span className="rounded-full bg-[#f6f3f4] px-3 py-1 text-xs font-bold text-brand-muted">
          Read-only
        </span>
      </div>

      <div className="px-[25px] pb-[25px]">
        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-9 w-9 animate-pulse rounded-full bg-[#f6f3f4]" />
                <div className="h-4 w-32 animate-pulse rounded bg-[#f6f3f4]" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f6f3f4] text-brand-muted">
              <Clock3 className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-brand-ink">No activity recorded today</p>
            <p className="text-xs text-brand-muted">
              Your clock-in, breaks, and clock-out events will appear here automatically.
            </p>
          </div>
        ) : (
          <ol aria-label="Today's session timeline" className="flex flex-col">
            {events.map((event, i) => {
              const meta = KIND_META[event.kind];
              const isLast = i === events.length - 1;

              return (
                <li key={`${event.kind}-${i}`} className="flex items-stretch gap-4">
                  {/* Left column: icon + connector line */}
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        meta.color,
                      )}
                    >
                      {meta.icon}
                    </span>
                    {!isLast && (
                      <div className={cn("mt-1 w-0.5 flex-1 rounded-full", meta.lineColor)} />
                    )}
                  </div>

                  {/* Right column: time + label */}
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-col justify-start gap-0.5 pb-5",
                      isLast && "pb-0",
                    )}
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.8px] text-brand-muted">
                      {timeLabel(event)}
                    </p>
                    <p className="text-sm font-semibold text-brand-ink">{event.label}</p>
                    {event.kind === "break" ? (
                      <p className="text-xs text-brand-muted">
                        {event.durationMinutes != null
                          ? formatMinutes(event.durationMinutes)
                          : "Ongoing"}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
