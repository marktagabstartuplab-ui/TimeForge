"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { listTimeEntries } from "../api/time-entries.service";
import { formatStopwatch } from "@/lib/time";

/**
 * Persistent running-session indicator for the top bar: ticking elapsed time
 * wherever the user navigates, linking back to the tracker.
 */
export function RunningTimerChip() {
  const [now, setNow] = useState(() => Date.now());

  const { data } = useQuery({
    queryKey: ["time-entries", "running"],
    queryFn: () => listTimeEntries({ running: true, limit: 1 }),
    refetchInterval: 30_000,
  });

  const running = data?.data[0] ?? null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;

  const elapsed = Math.max(0, (now - new Date(running.startTime).getTime()) / 1000);

  return (
    <Link
      href="/time-tracking"
      aria-label={`Timer running, ${formatStopwatch(elapsed)} elapsed — open Time Tracking`}
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
