'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { hasPermission } from '../rbac';

interface PermissionGuardProps {
  requiredPermission: string | null;
  children: React.ReactNode;
}

/**
 * Page-level permission guard.
 * Redirects to /dashboard when the logged-in user lacks the required
 * permission. A null requiredPermission means no guard (e.g. the page
 * has no matching entry in ROUTE_PERMISSIONS — still renders).
 */
export function PermissionGuard({ requiredPermission, children }: PermissionGuardProps) {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !requiredPermission) return;
    if (!hasPermission(user.roles, requiredPermission)) {
      router.replace('/dashboard');
    }
  }, [user, requiredPermission, router]);

  // While the user is still loading, show the loading state (the shell around
  // this guard has already mounted by this point — AppShell/FinanceAppShell
  // only render their <main> once the session has resolved — but this covers
  // the guard being reused anywhere that invariant doesn't hold).
  if (!user) return <LoadingScreen fullHeight={false} />;

  // Permission check — if user lacks permission, show a loading state while
  // the redirect in the effect above fires, instead of a blank content area.
  if (requiredPermission && !hasPermission(user.roles, requiredPermission)) {
    return <LoadingScreen fullHeight={false} />;
  }

  return <>{children}</>;
}
