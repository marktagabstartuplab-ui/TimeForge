"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { listTimeEntries } from "../api/time-entries.service";
import { formatStopwatch, startOfDay, endOfDay } from "@/lib/time";

/**
 * Persistent running-session indicator for the top bar: ticking elapsed time
 * wherever the user navigates, linking back to the tracker.
 *
 * Shows the cumulative day total (all completed entries + the running
 * segment) using the same formula as CurrentSessionCard, so the chip and the
 * tracker card always agree. Shares the tracker page's query key/cache.
 */
export function RunningTimerChip() {
  const [now, setNow] = useState(() => Date.now());

  const { data } = useQuery({
    queryKey: ["time-entries", "today"],
    queryFn: () =>
      listTimeEntries({
        from: startOfDay(new Date()).toISOString(),
        to: endOfDay(new Date()).toISOString(),
        limit: 100,
      }),
    refetchInterval: 30_000,
  });

  const entries = data?.data ?? [];
  const running = entries.find((e) => !e.endTime) ?? null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;

  // Mirror CurrentSessionCard: read accumulated session seconds from localStorage.
  const accumulated = typeof window !== "undefined"
    ? parseFloat(window.localStorage.getItem("timeforge.session-accumulated-seconds") ?? "0")
    : 0;
  const elapsed = accumulated + Math.max(0, (now - new Date(running.startTime).getTime()) / 1000);

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
