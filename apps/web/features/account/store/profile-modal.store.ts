import { create } from "zustand";

interface ProfileModalState {
  isOpen: boolean;
  /** null = viewing/editing "my own" profile; set = an Admin viewing another employee (Employee Management). */
  targetUserId: string | null;
  open: (userId?: string) => void;
  close: () => void;
}

/** Global toggle for the Profile & Account overlay — opened from the avatar menu, Settings, or the Employee Management table. */
export const useProfileModalStore = create<ProfileModalState>((set) => ({
  isOpen: false,
  targetUserId: null,
  open: (userId) => set({ isOpen: true, targetUserId: userId ?? null }),
  close: () => set({ isOpen: false, targetUserId: null }),
}));
