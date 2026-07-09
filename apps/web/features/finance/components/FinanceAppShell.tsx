"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { refresh as refreshSession } from "@/features/auth/api/auth.service";
import { getMe } from "@/features/account/api/account.service";
import { ProfileAccountModal } from "@/features/account/components/ProfileAccountModal";
import { NotificationCenterModal } from "@/features/notifications/components/NotificationCenterModal";
import { setAccessToken } from "@/lib/api/client";
import { PermissionGuard } from "@/features/auth/components/PermissionGuard";
import { getRequiredPermission } from "@/features/auth/route-permissions";
import { AppTopBar } from "@/features/app-shell/components/AppTopBar";
import { FinanceSidebar } from "./FinanceSidebar";

export function FinanceAppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

    return () => { cancelled = true; };
  }, [user, setSession]);

  useEffect(() => {
    if (restoreFailed) router.replace("/login");
  }, [restoreFailed, router]);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f2f2f2]" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <FinanceSidebar />
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
