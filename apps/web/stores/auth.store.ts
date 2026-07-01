import { create } from "zustand";
import type { AuthUser } from "@/lib/api/auth";

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
}

// Access token + user live in memory only for this session — the refresh
// token is an httpOnly cookie the backend manages, never touched here.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clearSession: () => set({ accessToken: null, user: null }),
}));
