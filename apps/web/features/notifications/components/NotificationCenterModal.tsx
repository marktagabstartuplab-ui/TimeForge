"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogCloseButton } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import {
  archiveNotification,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
  type NotificationSort,
} from "../api/notifications.service";
import { useNotificationCenterStore } from "../store/notification-center.store";
import { useNotificationsRealtime } from "../hooks/useNotificationsRealtime";
import { CATEGORY_LABELS, groupByDate } from "../lib/notification-copy";
import { NotificationCard } from "./NotificationCard";

type TabValue = "ALL" | "UNREAD" | "ARCHIVED" | NotificationCategory;

const TABS: { value: TabValue; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "DAILY_SCRUM", label: CATEGORY_LABELS.DAILY_SCRUM },
  { value: "TIMESHEETS", label: CATEGORY_LABELS.TIMESHEETS },
  { value: "PAYROLL", label: CATEGORY_LABELS.PAYROLL },
  { value: "SCHEDULE", label: CATEGORY_LABELS.SCHEDULE },
  { value: "SYSTEM", label: CATEGORY_LABELS.SYSTEM },
  { value: "ACCOUNT", label: CATEGORY_LABELS.ACCOUNT },
  { value: "SECURITY", label: CATEGORY_LABELS.SECURITY },
];

const SORT_OPTIONS: { value: NotificationSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "priority", label: "Priority" },
  { value: "unread", label: "Unread First" },
];

export function NotificationCenterModal() {
  const isOpen = useNotificationCenterStore((s) => s.isOpen);
  const close = useNotificationCenterStore((s) => s.close);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tab, setTab] = useState<TabValue>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<NotificationSort>("newest");
  const [page, setPage] = useState(1);

  const onHighPriority = useCallback((t: ToastState) => setToast(t), []);
  useNotificationsRealtime(user?.id, onHighPriority);

  const isArchivedTab = tab === "ARCHIVED";
  const category = tab === "ALL" || tab === "UNREAD" || tab === "ARCHIVED" ? undefined : tab;
  const unreadOnly = tab === "UNREAD";

  const listQuery = useQuery({
    queryKey: ["notifications", "list", { category, unreadOnly, archived: isArchivedTab, search, sortBy, page }],
    queryFn: () =>
      listNotifications({
        category,
        unreadOnly,
        archived: isArchivedTab,
        search: search || undefined,
        sortBy,
        page,
        pageSize: 8,
      }),
    enabled: isOpen,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" }),
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      invalidate();
      setToast({ message: "All notifications marked as read.", tone: "success" });
    },
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" }),
  });
  const archive = useMutation({
    mutationFn: archiveNotification,
    onSuccess: invalidate,
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" }),
  });
  const remove = useMutation({
    mutationFn: deleteNotification,
    onSuccess: invalidate,
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" }),
  });

  const groups = listQuery.data ? groupByDate(listQuery.data.data) : [];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex w-[min(720px,calc(100vw-2rem))] max-h-[88dvh] flex-col">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 px-6 py-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-brand" aria-hidden="true" />
              <DialogTitle>Notifications</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                <CheckCheck aria-hidden="true" />
                Mark all as read
              </Button>
              <DialogCloseButton />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-[#c3c6d2]/50 px-6 py-3">
            <SearchInput
              placeholder="Search notifications..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search notifications"
            />
            <div className="flex min-w-0 items-center gap-3">
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v as TabValue);
                  setPage(1);
                }}
                className="min-w-0 flex-1 overflow-hidden"
              >
                <TabsList className="min-w-0 w-full overscroll-x-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:!block [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c3c6d2]/80">
                  {TABS.map((t) => (
                    <TabsTab key={t.value} value={t.value}>
                      {t.label}
                    </TabsTab>
                  ))}
                </TabsList>
              </Tabs>
              <div className="shrink-0">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as NotificationSort)}>
                  <SelectTrigger size="sm" aria-label="Sort by">
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-muted">Sort:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="flex flex-col gap-2 p-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : listQuery.isError ? (
              <div className="p-6">
                <ErrorState message="Couldn't load notifications." onRetry={() => listQuery.refetch()} />
              </div>
            ) : listQuery.data && listQuery.data.data.length > 0 ? (
              <div>
                {groups.map((group) => (
                  <div key={group.label}>
                    <p className="bg-[#f6f3f4] px-6 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-brand-muted">
                      {group.label}
                    </p>
                    <ul className="divide-y divide-[#c3c6d2]/40">
                      {group.items.map((n) => (
                        <NotificationCard
                          key={n.id}
                          notification={n}
                          onMarkRead={(id) => markOne.mutate(id)}
                          onArchive={(id) => archive.mutate(id)}
                          onDelete={(id) => remove.mutate(id)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyState
                  message={
                    tab === "UNREAD"
                      ? "You're all caught up."
                      : search
                        ? "No notifications match your search."
                        : "No notifications in this category yet."
                  }
                />
              </div>
            )}
          </div>

          {listQuery.data && listQuery.data.totalPages > 1 ? (
            <div className="border-t border-[#c3c6d2]/50 px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-brand-muted">
                  Showing {listQuery.data.data.length} of {listQuery.data.total} notifications
                </p>
                <Pagination page={listQuery.data.page} totalPages={listQuery.data.totalPages} onPageChange={setPage} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
