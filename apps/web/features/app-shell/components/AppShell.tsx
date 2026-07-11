"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { refresh as refreshSession } from "@/features/auth/api/auth.service";
import { getMe } from "@/features/account/api/account.service";
import { ProfileAccountModal } from "@/features/account/components/ProfileAccountModal";
import { NotificationCenterModal } from "@/features/notifications/components/NotificationCenterModal";
import { setAccessToken } from "@/lib/api/client";
import { PermissionGuard } from "@/features/auth/components/PermissionGuard";
import { getRequiredPermission } from "@/features/auth/route-permissions";
import { LoadingScreen } from "@/components/ui/loading-screen";
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
  const pathname = usePathname();
  const { user, setSession } = useAuth();
  const [restoreFailed, setRestoreFailed] = useState(false);

  // Deliberately no "have we already started" ref guard here: under React
  // Strict Mode's dev-only double-invoke (mount → effect → cleanup → effect
  // again), a ref that persists across both invocations would let the first
  // (cancelled) invocation's in-flight request own the only attempt, while
  // its own `cancelled` flag then discards the result — user never gets set,
  // permanently. Each invocation must own and complete its own attempt; the
  // `if (user) return` below is enough to stop the effect once restore
  // actually succeeds.
  useEffect(() => {
    if (user) return;

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
    return <LoadingScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopBar />
        <main className="flex-1 overflow-auto bg-white p-4 sm:p-6">
          <PermissionGuard requiredPermission={getRequiredPermission(pathname)}>{children}</PermissionGuard>
        </main>
      </div>
      <ProfileAccountModal />
      <NotificationCenterModal />
    </div>
  );
}
