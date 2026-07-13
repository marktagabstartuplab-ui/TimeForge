"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Server,
  Database,
  LogIn,
  Users,
  FileClock,
  ClipboardCheck,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Timer,
} from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { getAdminOverview } from "../api/admin-dashboard.service";
import { getRecurringIssuesSummary } from "@/features/recurring-issues/api/recurring-issues.service";
import { ChartsSection } from "./ChartsSection";
import { RecentActivityPanel } from "./RecentActivityPanel";
import { QuickActionsPanel } from "./QuickActionsPanel";

const HEALTH_TONE: Record<string, BadgeTone> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function payrollSummary(byStatus: Record<string, number>): string {
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (total === 0) return "No periods";
  const parts = Object.entries(byStatus)
    .map(([status, count]) => `${count} ${status.charAt(0)}${status.slice(1).toLowerCase()}`)
    .join(" · ");
  return parts;
}

export function SystemOverviewContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "dashboard", "overview"],
    queryFn: getAdminOverview,
    refetchInterval: 30_000,
  });

  const v = (n: number | undefined) => (isLoading ? "…" : String(n ?? 0));

  const { data: recurringSummary, isLoading: isRecurringLoading } = useQuery({
    queryKey: ["admin", "dashboard", "recurring-issues-summary"],
    queryFn: getRecurringIssuesSummary,
    refetchInterval: 60_000,
  });
  const rv = (n: number | undefined) => (isRecurringLoading ? "…" : String(n ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">System Overview</h1>
          <p className="text-sm text-brand-muted">Real-time platform metrics and administrative controls.</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start rounded-[8px] border border-[#c3c6d2] px-3 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:opacity-50 sm:self-auto"
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between">
            <Activity className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
            {data ? (
              <StatusBadge
                label={data.systemHealth.charAt(0).toUpperCase() + data.systemHealth.slice(1)}
                tone={HEALTH_TONE[data.systemHealth]}
              />
            ) : null}
          </div>
          <p className="mt-2 text-base text-brand-muted">System Health</p>
          <p className="text-2xl font-bold text-brand-ink">
            {isLoading ? "…" : `Up ${formatUptime(data?.uptimeSeconds ?? 0)}`}
          </p>
        </div>

        <StatCard icon={Server} label="API Status" value={isLoading ? "…" : `${data?.apiLatency ?? 0} ms`} />
        <StatCard icon={Database} label="Database Health" value={isLoading ? "…" : `${data?.databaseLatency ?? 0} ms`} />
        <StatCard icon={LogIn} label="Active Sessions" value={v(data?.activeSessions)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Active Users" value={v(data?.activeUsers)} />
        <StatCard icon={FileClock} label="Today's Timesheets" value={v(data?.todayTimesheets)} />
        <StatCard
          icon={ClipboardCheck}
          label="Pending Approvals"
          value={v(data?.pendingApprovals)}
          badge={data && data.pendingApprovals > 0 ? String(data.pendingApprovals) : undefined}
        />
        <StatCard
          icon={Wallet}
          label="Payroll Status"
          value={isLoading ? "…" : payrollSummary(data?.payrollStatus ?? {})}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={AlertTriangle} label="Recurring Issues (Open)" value={rv(recurringSummary?.total)} />
        <StatCard icon={Timer} label="Recurring Delays" value={rv(recurringSummary?.delays)} />
        <StatCard icon={TrendingUp} label="Trending Up" value={rv(recurringSummary?.increasing)} />
      </div>

      <ChartsSection />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivityPanel />
        </div>
        <QuickActionsPanel onToast={setToast} />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
