import { create } from "zustand";

const LS_COLLAPSED_KEY = "tf:sidebar:collapsed";
const LS_LAST_MENU_KEY = "tf:sidebar:lastMenu";

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "true";
}

function readString(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

interface SidebarState {
  /** Whether the sidebar is collapsed (icons-only) on desktop. */
  isCollapsed: boolean;
  /** Last opened/clicked menu item id. */
  lastOpenedMenu: string;
  /** Whether the mobile drawer is open. */
  isMobileOpen: boolean;

  toggleCollapse: () => void;
  setCollapsed: (value: boolean) => void;
  openMobile: () => void;
  closeMobile: () => void;
  setLastMenu: (id: string) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: readBool(LS_COLLAPSED_KEY, false),
  lastOpenedMenu: readString(LS_LAST_MENU_KEY, "dashboard"),
  isMobileOpen: false,

  toggleCollapse: () =>
    set((s) => {
      const next = !s.isCollapsed;
      localStorage.setItem(LS_COLLAPSED_KEY, String(next));
      return { isCollapsed: next };
    }),

  setCollapsed: (value) => {
    localStorage.setItem(LS_COLLAPSED_KEY, String(value));
    set({ isCollapsed: value });
  },

  openMobile: () => set({ isMobileOpen: true }),
  closeMobile: () => set({ isMobileOpen: false }),

  setLastMenu: (id) => {
    localStorage.setItem(LS_LAST_MENU_KEY, id);
    set({ lastOpenedMenu: id });
  },
}));
