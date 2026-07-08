"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Bell, HelpCircle, Menu } from "lucide-react";
import { getUnreadCount } from "@/features/notifications/api/notifications.service";
import { useNotificationCenterStore } from "@/features/notifications/store/notification-center.store";
import { RunningTimerChip } from "@/features/time-tracking/components/RunningTimerChip";
import { useSidebarStore } from "../store/sidebar.store";
import { UserMenu } from "./UserMenu";

export function AppTopBar() {
  const openMobile = useSidebarStore((s) => s.openMobile);
  const openNotifications = useNotificationCenterStore((s) => s.open);
  const { data: notifCount } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 5 * 60_000,
  });

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-[#c3c6d2]/60 bg-white px-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)] sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={openMobile}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-muted hover:bg-[#f6f3f4] lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="relative w-full max-w-80">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted/50"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search tasks, shifts..."
            aria-label="Search"
            className="h-9 w-full rounded-full bg-[#f6f3f4] pl-10 pr-4 text-sm text-brand-ink placeholder:text-brand-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <RunningTimerChip />
        <button
          type="button"
          onClick={openNotifications}
          aria-label={notifCount ? `Notifications, ${notifCount.unread} unread` : "Notifications"}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-brand-muted hover:bg-[#f6f3f4]"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {notifCount && notifCount.unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-600" />
          ) : null}
        </button>
        <a
          href="/support"
          aria-label="Help"
          className="flex h-9 w-9 items-center justify-center rounded-full text-brand-muted hover:bg-[#f6f3f4]"
        >
          <HelpCircle className="h-5 w-5" aria-hidden="true" />
        </a>

        <span className="hidden h-8 w-px bg-[#c3c6d2] sm:block" aria-hidden="true" />

        <UserMenu />
      </div>
    </header>
  );
}
