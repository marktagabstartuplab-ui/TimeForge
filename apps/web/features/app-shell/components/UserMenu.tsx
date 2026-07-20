"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  Settings,
  Bell,
  HelpCircle,
  Keyboard,
  Moon,
  LogOut,
  PlayCircle,
  FileText,
  CalendarPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, type AvatarStatus } from "@/components/shared/Avatar";
import { getMe } from "@/features/account/api/account.service";
import { getUnreadCount } from "@/features/notifications/api/notifications.service";
import { useNotificationCenterStore } from "@/features/notifications/store/notification-center.store";
import { getCurrentWorkSession } from "@/features/time-tracking/api/work-sessions.service";
import { logout } from "@/features/auth/api/auth.service";
import { useProfileModalStore } from "@/features/account/store/profile-modal.store";
import { RequestLeaveDrawer } from "@/features/leave/components/RequestLeaveDrawer";
import { useAuth } from "@/providers/auth-provider";
import { hasPermission } from "@/features/auth/rbac";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function UserMenu() {
  const router = useRouter();
  const { user, clearSession } = useAuth();
  const openProfileModal = useProfileModalStore((s) => s.open);
  const openNotifications = useNotificationCenterStore((s) => s.open);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // Roles without time_entry:read (Finance, HR) can never have a work session —
  // this would otherwise retry a permanent 403 forever.
  const isExcludedRole = user?.roles.some((r) => r === "HR" || r === "FINANCE") ?? false;
  const canHaveWorkSession = !isExcludedRole && hasPermission(user?.roles, "time_entry:read");
  // Admin/HR/Finance aren't required to clock in — a real session (including a
  // break) still wins, but absent one their presence dot should read "online"
  // rather than "offline", which only makes sense for roles that do clock in.
  const isNonTrackedRole = user?.roles.some((r) => r === "HR" || r === "FINANCE" || r === "ADMIN") ?? false;
  // Daily Scrum / Timesheet / Request Leave are individual-contributor actions —
  // only Employees see them here, regardless of what other permissions a role holds.
  const isEmployee = user?.roles.includes("EMPLOYEE") ?? false;

  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: getMe });
  const { data: notifCount } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 5 * 60_000,
  });
  const { data: workSession } = useQuery({
    queryKey: ["work-session", "current"],
    queryFn: getCurrentWorkSession,
    enabled: canHaveWorkSession,
  });

  // Real global shortcut: "?" opens the shortcuts guide (skipped while typing in a field).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "?" && !isTyping) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const session = workSession?.session ?? null;
  const status: AvatarStatus = session?.isActive
    ? workSession?.onBreak
      ? "break"
      : "active"
    : isNonTrackedRole
      ? "active"
      : "offline";
  const statusLabel =
    status === "break" ? "On break" : status === "active" ? (session?.isActive ? "Active now" : "Online") : "Not clocked in";
  const roleName = me?.employmentType === "INTERN" ? "INTERN" : me?.roles[0]?.role.name;

  return (
    <>
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
              <Avatar
                firstName={me?.firstName ?? ""}
                lastName={me?.lastName ?? ""}
                imageUrl={me?.avatarUrl}
                size="sm"
                status={status}
              />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-72">
          {me ? (
            <div className="flex items-start gap-3 px-2 py-2.5">
              <Avatar firstName={me.firstName} lastName={me.lastName} imageUrl={me.avatarUrl} size="md" status={status} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-navy">
                  {me.firstName} {me.lastName}
                </p>
                <p className="truncate text-xs text-brand-muted">{me.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {roleName ? (
                    <span className="rounded-full bg-brand-cyan/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      {titleCase(roleName)}
                    </span>
                  ) : null}
                  {me.department ? <span className="text-[11px] text-brand-muted">{me.department.name}</span> : null}
                </div>
                <p className="mt-1 text-[11px] text-brand-muted">{statusLabel}</p>
              </div>
            </div>
          ) : null}

          {isEmployee ? (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                <DropdownMenuItem render={<a href="/time-tracking" />}>
                  <PlayCircle aria-hidden="true" />
                  {session?.isActive ? "Resume Session" : "Start Daily Scrum"}
                </DropdownMenuItem>
                <DropdownMenuItem render={<a href="/timesheets" />}>
                  <FileText aria-hidden="true" />
                  Open Timesheet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLeaveOpen(true)}>
                  <CalendarPlus aria-hidden="true" />
                  Request Leave
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => openProfileModal()}>
            <User aria-hidden="true" />
            View Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/settings" />}>
            <Settings aria-hidden="true" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openNotifications}>
            <Bell aria-hidden="true" />
            Notifications
            {notifCount && notifCount.unread > 0 ? (
              <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                {notifCount.unread}
              </span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/support" />}>
            <HelpCircle aria-hidden="true" />
            Support
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
            <Keyboard aria-hidden="true" />
            Keyboard Shortcuts
            <span className="ml-auto text-[10px] text-brand-muted">?</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Moon aria-hidden="true" />
            Theme
            <span className="ml-auto text-[10px] text-brand-muted">Coming soon</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut aria-hidden="true" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <RequestLeaveDrawer open={leaveOpen} onOpenChange={setLeaveOpen} />
    </>
  );
}
