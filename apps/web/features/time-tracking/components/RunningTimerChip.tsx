"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { getCurrentWorkSession } from "../api/work-sessions.service";
import { formatStopwatch } from "@/lib/time";
import { useAuth } from "@/providers/auth-provider";

/**
 * Persistent running-session indicator for the top bar: ticking elapsed time
 * wherever the user navigates, linking back to the tracker.
 *
 * Reads the same WorkSession (GET /work-sessions/current, shared query key
 * with CurrentSessionCard) and applies the identical clockIn-minus-breaks
 * formula, so the chip and the tracker card always agree — this used to
 * reconstruct elapsed time from today's time entries plus a
 * "session-accumulated-seconds" localStorage value that nothing ever wrote,
 * which could drift arbitrarily far from the real session.
 */
export function RunningTimerChip() {
  const [now, setNow] = useState(() => Date.now());
  const { user } = useAuth();
  // Finance doesn't do daily time tracking (no time_entry:* permission) — polling this
  // endpoint for them just retries a permanent 403 forever. Everyone else does track time.
  const canHaveWorkSession = !(user?.roles.includes("FINANCE") && !user.roles.includes("ADMIN"));

  const { data: workSession } = useQuery({
    queryKey: ["work-session", "current"],
    queryFn: getCurrentWorkSession,
    refetchInterval: 30_000,
    enabled: canHaveWorkSession,
  });

  const session = workSession?.session ?? null;
  const onBreak = workSession?.onBreak ?? false;
  const running = Boolean(session?.isActive && !onBreak);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running || !session) return null;

  const breakMinutes = session.breakMinutes ?? 0;
  const elapsed = Math.max(0, (now - new Date(session.clockIn).getTime()) / 1000 - breakMinutes * 60);

  return (
    <Link
      href="/time-tracking"
      aria-label={`Timer running, ${formatStopwatch(elapsed)} elapsed today — open Daily Scrum`}
      className="flex h-9 items-center gap-2 rounded-full bg-brand-navy px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#00394e]"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-mono tabular-nums">{formatStopwatch(elapsed)}</span>
    </Link>
  );
}
