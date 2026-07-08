"use client";

import { useState } from "react";
import Link from "next/link";
import { Timer, CalendarPlus } from "lucide-react";
import { RequestLeaveDrawer } from "@/features/leave/components/RequestLeaveDrawer";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHero({ firstName }: { firstName: string }) {
  const [leaveOpen, setLeaveOpen] = useState(false);

  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.32px] text-brand-navy">
          {greeting()}, {firstName}
        </h1>
        <p className="text-base text-brand-muted">Here&apos;s what&apos;s happening with your work today.</p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/time-tracking"
          className="flex h-11 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-[#1467d6]"
        >
          <Timer className="h-[18px] w-[18px]" aria-hidden="true" />
          Clock In
        </Link>
        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-[#e4e2e3] px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#d8d6d7]"
        >
          <CalendarPlus className="h-[18px] w-[18px]" aria-hidden="true" />
          Request Leave
        </button>
      </div>
      <RequestLeaveDrawer open={leaveOpen} onOpenChange={setLeaveOpen} />
    </div>
  );
}
