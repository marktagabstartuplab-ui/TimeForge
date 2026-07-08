import {
  CalendarClock,
  CalendarOff,
  ClipboardCheck,
  FileText,
  Megaphone,
  ShieldAlert,
  TrendingUp,
  UserCircle,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AppNotification, NotificationCategory } from "../api/notifications.service";

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  DAILY_SCRUM: "Daily Scrum",
  TIMESHEETS: "Timesheets",
  PAYROLL: "Payroll",
  ACCOUNT: "Account",
  SYSTEM: "System",
  SCHEDULE: "Schedule",
  SECURITY: "Security",
  LEAVE: "Leave",
  PERFORMANCE: "Performance",
};

export const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  DAILY_SCRUM: ClipboardCheck,
  TIMESHEETS: FileText,
  PAYROLL: Wallet,
  ACCOUNT: UserCircle,
  SYSTEM: Megaphone,
  SCHEDULE: CalendarClock,
  SECURITY: ShieldAlert,
  LEAVE: CalendarOff,
  PERFORMANCE: TrendingUp,
};

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24 && isSameDay(date, now)) return `${diffHours}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface NotificationGroup {
  label: string;
  items: AppNotification[];
}

/** Buckets notifications into Today / Yesterday / Earlier This Week / Earlier This Month / Older. */
export function groupByDate(items: AppNotification[]): NotificationGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 7);
  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(startOfToday.getDate() - 30);

  const buckets: Record<string, AppNotification[]> = {
    Today: [],
    Yesterday: [],
    "Earlier This Week": [],
    "Earlier This Month": [],
    Older: [],
  };

  for (const item of items) {
    const created = new Date(item.createdAt);
    if (created >= startOfToday) buckets.Today.push(item);
    else if (created >= startOfYesterday) buckets.Yesterday.push(item);
    else if (created >= startOfWeek) buckets["Earlier This Week"].push(item);
    else if (created >= startOfMonth) buckets["Earlier This Month"].push(item);
    else buckets.Older.push(item);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
