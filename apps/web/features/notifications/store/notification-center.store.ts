import { create } from "zustand";

interface NotificationCenterState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** Global toggle for the Notification Center overlay — opened from the navbar bell. */
export const useNotificationCenterStore = create<NotificationCenterState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
