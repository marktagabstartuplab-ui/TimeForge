"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import type { ToastState } from "@/components/shared/Toast";
import type { AppNotification } from "../api/notifications.service";

/**
 * Subscribes to this user's own Supabase Realtime Broadcast channel and keeps
 * the notification list/unread-count queries live across tabs. Falls back to
 * React Query's default refetch-on-window-focus/reconnect when Realtime isn't
 * configured or the socket drops — never left fully stale.
 */
export function useNotificationsRealtime(userId: string | undefined, onHighPriority: (t: ToastState) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !supabase) return;

    const channel = supabase.channel(`notifications:user:${userId}`);

    channel
      .on("broadcast", { event: "new_notification" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        // Aggressively invalidate scrum-entries so supervisor comments 
        // instantly appear on the dashboard if the user is already on it
        // or navigates to it without clicking the specific deep link.
        queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
        
        const notification = (payload.payload as { notification?: AppNotification })?.notification;
        if (notification?.priority === "HIGH") {
          onHighPriority({ message: notification.title, tone: "success" });
        }
      })
      .on("broadcast", { event: "notification_updated" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .on("broadcast", { event: "count_changed" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [userId, queryClient, onHighPriority]);
}
