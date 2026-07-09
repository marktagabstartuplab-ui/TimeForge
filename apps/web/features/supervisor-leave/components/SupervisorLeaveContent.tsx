"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ErrorState } from "@/components/shared/ErrorState";
import { listLeaveRequests } from "@/features/leave/api/leave.service";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/features/leave/api/leave.service";
import { useCan } from "@/features/auth/rbac";
import { LeaveFiltersBar, type LeaveFilters } from "./LeaveFiltersBar";
import { TeamLeaveTable } from "./TeamLeaveTable";
import { LeaveReviewModal } from "./LeaveReviewModal";

export function SupervisorLeaveContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [reviewRequest, setReviewRequest] = useState<LeaveRequest | null>(null);
  const [filters, setFilters] = useState<LeaveFilters>({
    search: "",
    type: "",
    status: "PENDING",
    departmentId: "",
    startDate: "",
    endDate: "",
  });

  // HR/Admin have org-wide visibility (leave_request:read_org); supervisors are
  // scoped to their direct reports (leave_request:read_team). The backend
  // enforces both — this only selects which scope to request.
  const canReadOrg = useCan("leave_request:read_org");
  const queryParams: Record<string, string | undefined> = { scope: canReadOrg ? "org" : "team" };
  if (filters.status) queryParams.status = filters.status;
  if (filters.type) queryParams.type = filters.type;
  if (filters.startDate) queryParams.startDateFrom = filters.startDate;
  if (filters.endDate) queryParams.startDateTo = filters.endDate;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["supervisor", "leave", queryParams.scope, filters],
    queryFn: () => listLeaveRequests(queryParams as Parameters<typeof listLeaveRequests>[0]),
    refetchInterval: 30_000,
  });

  const rows = data?.data ?? [];

  const filteredRows = rows.filter((r) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const name = r.user ? `${r.user.firstName} ${r.user.lastName}`.toLowerCase() : "";
      if (!name.includes(q)) return false;
    }
    if (filters.departmentId && r.user?.departmentId !== filters.departmentId) {
      return false;
    }
    return true;
  });

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Leave Management"
          subtitle="Review and manage your team's leave requests."
        />
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load leave requests."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader
        title="Leave Management"
        subtitle="Review and manage your team's leave requests."
      />
      <LeaveFiltersBar filters={filters} onFiltersChange={setFilters} />
      <TeamLeaveTable
        rows={filteredRows}
        isLoading={isLoading}
        onReview={setReviewRequest}
        filtersActive={!!(filters.search || filters.type || filters.status !== "PENDING" || filters.departmentId || filters.startDate || filters.endDate)}
        onClearFilters={() => setFilters({ search: "", type: "", status: "PENDING", departmentId: "", startDate: "", endDate: "" })}
      />
      <LeaveReviewModal
        request={reviewRequest}
        onOpenChange={(open) => !open && setReviewRequest(null)}
        onToast={setToast}
      />
    </div>
  );
}
