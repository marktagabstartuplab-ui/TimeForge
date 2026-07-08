"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { listNotifications } from "@/features/notifications/api/notifications.service";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Recent Activity" feed backed by the notifications API. */
export function RecentActivityCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => listNotifications({ pageSize: 5 }),
  });

  const items = data?.data ?? [];

  return (
    <SectionCard title="Recent Activity">
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : isError || items.length === 0 ? (
        <EmptyState message="No recent activity to show yet." />
      ) : (
        <ol className="flex flex-col">
          {items.map((n, i) => (
            <li
              key={n.id}
              className={
                i === 0
                  ? "flex items-start gap-3 py-2.5"
                  : "flex items-start gap-3 border-t border-[#c3c6d2]/40 py-2.5"
              }
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-ink">{n.title}</p>
                <p className="truncate text-xs text-brand-muted">{n.message}</p>
              </div>
              <span className="shrink-0 text-xs text-brand-muted">{timeAgo(n.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
