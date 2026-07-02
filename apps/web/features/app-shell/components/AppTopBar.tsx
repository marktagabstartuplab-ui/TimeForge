"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Bell, HelpCircle, LogOut, Settings, Menu } from "lucide-react";
import { getMe } from "@/features/account/api/account.service";
import { getNotificationCount } from "@/features/notifications/api/notifications.service";
import { logout } from "@/features/auth/api/auth.service";
import { RunningTimerChip } from "@/features/time-tracking/components/RunningTimerChip";
import { useAuth } from "@/providers/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function AppTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const { clearSession } = useAuth();
  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: getMe });
  const { data: notifCount } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: getNotificationCount,
    refetchInterval: 60_000,
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-[#c3c6d2]/60 bg-white px-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)] sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
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
          aria-label={notifCount ? `Notifications, ${notifCount.unread} unread` : "Notifications"}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-brand-muted hover:bg-[#f6f3f4]"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {notifCount && notifCount.unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-600" />
          ) : null}
        </button>
        <button
          type="button"
          aria-label="Help"
          className="flex h-9 w-9 items-center justify-center rounded-full text-brand-muted hover:bg-[#f6f3f4]"
        >
          <HelpCircle className="h-5 w-5" aria-hidden="true" />
        </button>

        <span className="hidden h-8 w-px bg-[#c3c6d2] sm:block" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Account menu"
                className="flex items-center gap-3 rounded-[8px] py-1.5 pl-2 pr-1.5 hover:bg-[#f6f3f4]"
              >
                <div className="hidden text-right sm:block">
                  <p className="text-sm text-brand-ink">
                    {me ? `${me.firstName} ${me.lastName[0] ?? ""}.` : "..."}
                  </p>
                  <p className="text-[11px] text-brand-muted">{me?.jobTitle ?? " "}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                  {me ? initials(me.firstName, me.lastName) : ""}
                </div>
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem render={<a href="/settings" />}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
