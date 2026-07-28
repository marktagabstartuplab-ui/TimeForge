"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer, CalendarPlus, UserCheck, Palmtree, Loader2 } from "lucide-react";
import { RequestLeaveDrawer } from "@/features/leave/components/RequestLeaveDrawer";
import { listLeaveRequests, returnToWorkFromLeave, type LeaveRequest } from "@/features/leave/api/leave.service";
import { Toast, type ToastState } from "@/components/shared/Toast";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHero({ firstName }: { firstName: string }) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const queryClient = useQueryClient();

  // Fetch approved leave requests for the logged-in employee to check if currently on active leave
  const { data: userLeaves } = useQuery({
    queryKey: ["leave", "my-approved-requests"],
    queryFn: () => listLeaveRequests({ scope: "self", status: "APPROVED", limit: 20 }),
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeLeave = userLeaves?.data.find((r: LeaveRequest) => {
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  });

  const returnMutation = useMutation({
    mutationFn: (leaveId: string) => returnToWorkFromLeave(leaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "leave-summary"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard-leave"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "leave"] });
      queryClient.invalidateQueries({ queryKey: ["account", "team-presence"] });
      setToast({ message: "Welcome back! Your return to work has been confirmed and status updated to Active.", tone: "success" });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to confirm return to work.", tone: "error" });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {activeLeave ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Palmtree className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                  Active Leave ({activeLeave.type})
                </span>
                <span className="text-xs font-medium text-amber-700">
                  Until {new Date(activeLeave.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="text-xs font-semibold text-amber-900 mt-1">
                You are currently scheduled on leave. Returned early? Click below to resume active duty.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => returnMutation.mutate(activeLeave.id)}
            disabled={returnMutation.isPending}
            className="flex h-10 items-center gap-2 rounded-[10px] bg-emerald-600 px-4 text-xs font-bold text-white transition-colors hover:bg-emerald-700 shrink-0 shadow-sm disabled:opacity-50"
          >
            {returnMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            Return to Work / End Leave
          </button>
        </div>
      ) : null}

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
    </div>
  );
}
