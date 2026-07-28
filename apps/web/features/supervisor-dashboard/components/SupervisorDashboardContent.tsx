"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, XCircle, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { MetricCard } from "@/components/shared/MetricCard";
import { listLeaveRequests } from "@/features/leave/api/leave.service";
import { PendingTimesheetsPanel } from "./PendingTimesheetsPanel";
import { PendingLeavePanel } from "./PendingLeavePanel";
import { DailyScrumReviewPanel } from "./DailyScrumReviewPanel";
import { TeamKpiPanel } from "./TeamKpiPanel";
import { ProductivityReportCard } from "./ProductivityReportCard";
import { RecurringIssuesPanel } from "@/features/recurring-issues/components/RecurringIssuesPanel";

import { useCan } from "@/features/auth/rbac";
import { todayInOrgTimeZone, startOfDay, endOfDay } from "@/lib/time";

export function SupervisorDashboardContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const canReadOrg = useCan("leave_request:read_org");
  const scope = canReadOrg ? "org" : "team";
  // Manila calendar day — the backend resolves these date params in the org
  // timezone too, so the window is the same on both sides regardless of where
  // the viewer's machine is set.
  const todayStr = todayInOrgTimeZone();

  const results = useQueries({
    queries: [
      {
        queryKey: ["supervisor", "leave-summary", "pending", scope],
        queryFn: async () => {
          const res = await listLeaveRequests({ scope, status: "PENDING", limit: 50 });
          return res.data.length;
        },
        refetchInterval: 30_000,
      },
      {
        queryKey: ["supervisor", "leave-summary", "approved-today", scope, todayStr],
        queryFn: async () => {
          const res = await listLeaveRequests({
            scope,
            status: "APPROVED",
            reviewedAtFrom: todayStr,
            reviewedAtTo: todayStr,
            limit: 50,
          });
          return res.data.length;
        },
        refetchInterval: 30_000,
      },
      {
        queryKey: ["supervisor", "leave-summary", "rejected-today", scope, todayStr],
        queryFn: async () => {
          const res = await listLeaveRequests({
            scope,
            status: "REJECTED",
            reviewedAtFrom: todayStr,
            reviewedAtTo: todayStr,
            limit: 50,
          });
          return res.data.length;
        },
        refetchInterval: 30_000,
      },
      {
        queryKey: ["supervisor", "leave-summary", "active", scope, todayStr],
        queryFn: async () => {
          const res = await listLeaveRequests({ scope, status: "APPROVED", limit: 50 });
          const now = new Date();
          const active = res.data.filter((r) => {
            const start = startOfDay(new Date(r.startDate));
            const end = endOfDay(new Date(r.endDate));
            return now >= start && now <= end;
          });
          return active.length;
        },
        refetchInterval: 30_000,
      },
    ],
  });

  const [pendingCount, approvedToday, rejectedToday, activeCount] = results;
  const isLoading = results.some((r) => r.isLoading);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader
        title="Supervisor Dashboard"
        subtitle="Review your team's timesheets, daily scrums, KPIs, leave requests, and productivity — all in one place."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/supervisor/leave?status=PENDING" className="block transition-opacity hover:opacity-80">
          <MetricCard
            icon={CalendarClock}
            iconTone="bg-amber-50 text-amber-600"
            label="Pending Leave"
            value={isLoading ? "—" : String(pendingCount.data ?? 0)}
            caption="Requests awaiting your review"
          />
        </Link>
        <Link href="/supervisor/leave?status=APPROVED" className="block transition-opacity hover:opacity-80">
          <MetricCard
            icon={CheckCircle2}
            iconTone="bg-green-50 text-green-600"
            label="Approved Today"
            value={isLoading ? "—" : String(approvedToday.data ?? 0)}
            caption="Leave requests approved"
          />
        </Link>
        <Link href="/supervisor/leave?status=REJECTED" className="block transition-opacity hover:opacity-80">
          <MetricCard
            icon={XCircle}
            iconTone="bg-red-50 text-red-600"
            label="Rejected Today"
            value={isLoading ? "—" : String(rejectedToday.data ?? 0)}
            caption="Leave requests rejected"
          />
        </Link>
        <Link href="/supervisor/leave" className="block transition-opacity hover:opacity-80">
          <MetricCard
            icon={Users}
            iconTone="bg-brand-cyan/15 text-brand"
            label="Active Leave"
            value={isLoading ? "—" : String(activeCount.data ?? 0)}
            caption="Team members on leave"
          />
        </Link>
      </div>

      <PendingTimesheetsPanel onToast={setToast} />
      <PendingLeavePanel onToast={setToast} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyScrumReviewPanel onToast={setToast} />
        <TeamKpiPanel />
      </div>

      <RecurringIssuesPanel />

      <ProductivityReportCard />
    </div>
  );
}
