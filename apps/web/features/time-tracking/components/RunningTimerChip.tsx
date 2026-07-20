"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { getCurrentWorkSession } from "../api/work-sessions.service";
import { formatStopwatch } from "@/lib/time";
import { useAuth } from "@/providers/auth-provider";
import { hasPermission } from "@/features/auth/rbac";

// Matches CurrentSessionCard's threshold and the timesheet's period-summary
// 8h/day split, so "overtime" means the same thing everywhere in the app.
const REGULAR_DAY_SECONDS = 8 * 3600;

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
  // The running-session chip is an Employee/Intern feature (Intern is not an
  // access role — interns hold EMPLOYEE, per packages/shared permissions). It
  // must not render for Admin/HR/Finance/Supervisor, even when such an account
  // has an active session (e.g. Admin's wildcard permission passes
  // time_entry:read). Also avoids polling a permanent 403 for HR/Finance.
  const isPrivilegedRole =
    user?.roles.some((r) => r === "ADMIN" || r === "SUPERVISOR" || r === "HR" || r === "FINANCE") ?? false;
  const canHaveWorkSession =
    !isPrivilegedRole &&
    (user?.roles.includes("EMPLOYEE") ?? false) &&
    hasPermission(user?.roles, "time_entry:read");

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

  // Render-guard, not just a fetch-guard: another component on the page (e.g.
  // the dashboard clock-in card) can populate the shared ["work-session",
  // "current"] cache, which this disabled query would still read.
  if (!canHaveWorkSession) return null;
  if (!running || !session) return null;

  const breakMinutes = session.breakMinutes ?? 0;
  const elapsed = Math.max(0, (now - new Date(session.clockIn).getTime()) / 1000 - breakMinutes * 60);
  const inOvertime = elapsed > REGULAR_DAY_SECONDS;
  const overtimeElapsed = Math.max(0, elapsed - REGULAR_DAY_SECONDS);

  return (
    <Link
      href="/time-tracking"
      aria-label={
        inOvertime
          ? `Timer running, ${formatStopwatch(elapsed)} elapsed today, ${formatStopwatch(overtimeElapsed)} of that is overtime — open Daily Scrum`
          : `Timer running, ${formatStopwatch(elapsed)} elapsed today — open Daily Scrum`
      }
      className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-bold text-white transition-colors ${
        inOvertime ? "bg-amber-600 hover:bg-amber-700" : "bg-brand-navy hover:bg-[#00394e]"
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            inOvertime ? "bg-amber-300" : "bg-red-400"
          }`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${inOvertime ? "bg-amber-200" : "bg-red-500"}`} />
      </span>
      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-mono tabular-nums">{formatStopwatch(elapsed)}</span>
      {inOvertime ? <span className="rounded-full bg-white/20 px-1.5 py-0.5">OT {formatStopwatch(overtimeElapsed)}</span> : null}
    </Link>
  );
}
