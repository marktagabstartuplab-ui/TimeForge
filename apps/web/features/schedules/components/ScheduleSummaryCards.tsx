import { CalendarCheck, Clock3, FileClock, Inbox } from "lucide-react";
import { MetricCard } from "@/components/shared/MetricCard";
import type { CalendarSummary } from "../api/schedules.service";

export function ScheduleSummaryCards({ summary, isLoading }: { summary: CalendarSummary | undefined; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={CalendarCheck}
        iconTone="bg-[#f0fdf4] text-[#16a34a]"
        label="Active Shifts"
        value={isLoading ? "…" : `${summary?.activeShifts ?? 0}`}
      />
      <MetricCard
        icon={Inbox}
        iconTone="bg-amber-50 text-amber-600"
        label="Open Shifts"
        value={isLoading ? "…" : `${summary?.openShifts ?? 0}`}
        caption="Drafts awaiting publish"
      />
      <MetricCard
        icon={FileClock}
        iconTone="bg-[#e6f0ff] text-[#0052cc]"
        label="Pending Requests"
        value={isLoading ? "…" : `${summary?.pendingRequests ?? 0}`}
      />
      <MetricCard
        icon={Clock3}
        iconTone="bg-brand-cyan/15 text-brand"
        label="Scheduled Hours"
        value={isLoading ? "…" : `${summary?.scheduledHours ?? 0}`}
        valueSuffix="h"
      />
    </div>
  );
}
