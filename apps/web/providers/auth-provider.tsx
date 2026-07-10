"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setAccessToken, setSessionExpiredHandler } from "@/lib/api/client";
import type { AuthUser } from "@/features/auth/api/auth.service";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state (access token + user) lives in memory only. The refresh token
 * is an httpOnly cookie the backend manages — never touched here.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);

  const setSession = useCallback((token: string, nextUser: AuthUser) => {
    setToken(token);
    setUser(nextUser);
    setAccessToken(token);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setAccessToken(null);
  }, []);

  // Bridges the axios client (a plain module, outside React) back into app
  // state: when a mid-session refresh fails because the refresh token itself
  // is invalid/expired/reused, drop the session and bounce to /login.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
      router.replace("/login");
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSession, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(accessToken),
      setSession,
      clearSession,
    }),
    [user, accessToken, setSession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
