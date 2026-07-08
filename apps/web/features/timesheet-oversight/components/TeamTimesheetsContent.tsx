"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPendingTimesheets, getTimesheetDetail } from "../api/timesheet-oversight.service";
import { PendingListPanel } from "./PendingListPanel";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import type { ToastState } from "@/components/shared/Toast";

interface TeamTimesheetsContentProps {
  onToast: (t: ToastState) => void;
}

export function TeamTimesheetsContent({ onToast }: TeamTimesheetsContentProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load all pending timesheets
  const pendingQuery = useQuery({
    queryKey: ["timesheet-oversight", "pending-queue"],
    queryFn: () => getPendingTimesheets(),
  });

  const pendingItems = pendingQuery.data?.data ?? [];

  // Automatically select the first item if no item is selected and items exist
  const activeId = selectedId || (pendingItems.length > 0 ? pendingItems[0].id : null);

  // Load selected timesheet details
  const detailQuery = useQuery({
    queryKey: ["timesheet-oversight", "pending-detail", activeId],
    queryFn: () => getTimesheetDetail(activeId!),
    enabled: activeId !== null,
  });

  const handleActionSuccess = () => {
    setSelectedId(null);
    pendingQuery.refetch();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left panel: queue list (col-span 4) */}
      <div className="lg:col-span-4 flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-muted">Pending Submissions</h3>
        <PendingListPanel
          items={pendingItems}
          selectedId={activeId}
          onSelect={setSelectedId}
          loading={pendingQuery.isLoading}
        />
      </div>

      {/* Right panel: review sheet details (col-span 8) */}
      <div className="lg:col-span-8 flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-muted">Review Panel</h3>
        <ReviewDetailPanel
          detail={detailQuery.data ?? null}
          loading={detailQuery.isFetching && activeId !== null}
          onSuccess={handleActionSuccess}
          onToast={onToast}
        />
      </div>
    </div>
  );
}
