import { apiClient } from "@/lib/api/client";

export interface NotificationCount {
  total: number;
  unread: number;
}

export async function getNotificationCount(): Promise<NotificationCount> {
  const { data } = await apiClient.get<NotificationCount>("/notifications/count");
  return data;
}

export interface AppNotification {
  id: string;
  type: string;
  status: string;
  /** Free-form JSON written by the backend (message/title vary by type). */
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function listNotifications(limit = 5): Promise<AppNotification[]> {
  const { data } = await apiClient.get<{ data: AppNotification[] }>("/notifications", {
    params: { limit },
  });
  return data.data;
}
