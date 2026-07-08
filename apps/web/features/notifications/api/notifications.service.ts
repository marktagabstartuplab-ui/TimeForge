import { apiClient } from "@/lib/api/client";

export type NotificationCategory =
  | "DAILY_SCRUM"
  | "TIMESHEETS"
  | "PAYROLL"
  | "ACCOUNT"
  | "SYSTEM"
  | "SCHEDULE"
  | "SECURITY"
  | "LEAVE"
  | "PERFORMANCE";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH";

export interface AppNotification {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  actionUrl: string | null;
  actionLabel: string | null;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
  readAt: string | null;
}

export type NotificationSort = "newest" | "oldest" | "priority" | "unread";

export interface ListNotificationsParams {
  category?: NotificationCategory;
  unreadOnly?: boolean;
  archived?: boolean;
  search?: string;
  sortBy?: NotificationSort;
  page?: number;
  pageSize?: number;
}

export interface ListNotificationsResult {
  data: AppNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function listNotifications(params: ListNotificationsParams = {}): Promise<ListNotificationsResult> {
  const { data } = await apiClient.get<ListNotificationsResult>("/notifications", { params });
  return data;
}

export async function getUnreadCount(): Promise<{ unread: number }> {
  const { data } = await apiClient.get<{ unread: number }>("/notifications/unread-count");
  return data;
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  const { data } = await apiClient.patch<AppNotification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const { data } = await apiClient.patch<{ updated: number }>("/notifications/read-all");
  return data;
}

export async function archiveNotification(id: string): Promise<AppNotification> {
  const { data } = await apiClient.patch<AppNotification>(`/notifications/${id}/archive`);
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}

export interface CreateAnnouncementPayload {
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  actionLabel?: string;
}

export async function createAnnouncement(payload: CreateAnnouncementPayload): Promise<{ sent: number }> {
  const { data } = await apiClient.post<{ sent: number }>("/notifications", payload);
  return data;
}
