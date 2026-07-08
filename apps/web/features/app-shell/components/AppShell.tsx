"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { refresh as refreshSession } from "@/features/auth/api/auth.service";
import { getMe } from "@/features/account/api/account.service";
import { ProfileAccountModal } from "@/features/account/components/ProfileAccountModal";
import { NotificationCenterModal } from "@/features/notifications/components/NotificationCenterModal";
import { setAccessToken } from "@/lib/api/client";
import { AdminSidebar } from "./AdminSidebar";
import { AppTopBar } from "./AppTopBar";

/**
 * Wraps every authenticated route: renders the sidebar + top bar and guards
 * access. Session state lives in memory only, so on a hard load/reload we
 * silently try to restore it from the httpOnly refresh cookie (POST
 * /auth/refresh + GET /users/me) before deciding to bounce to /login.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setSession } = useAuth();
  const [restoreFailed, setRestoreFailed] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (user || attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    (async () => {
      try {
        const tokens = await refreshSession();
        // Attach the new token before the next request — setSession() (which
        // also does this) only runs after getMe() resolves.
        setAccessToken(tokens.accessToken);
        const me = await getMe();
        if (cancelled) return;
        setSession(tokens.accessToken, {
          id: me.id,
          email: me.email,
          organizationId: me.organizationId,
          roles: me.roles.map((r) => r.role.key),
        });
      } catch {
        if (cancelled) return;
        setAccessToken(null);
        setRestoreFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, setSession]);

  useEffect(() => {
    if (restoreFailed) router.replace("/login");
  }, [restoreFailed, router]);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f2f2f2]" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopBar />
        <main className="flex-1 overflow-auto bg-white p-4 sm:p-6">{children}</main>
      </div>
      <ProfileAccountModal />
      <NotificationCenterModal />
    </div>
  );
}
