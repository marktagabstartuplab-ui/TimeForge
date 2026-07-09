'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
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

  // While the user is still loading, render nothing (AppShell shows a loading
  // spinner until the session resolves, so this gap is effectively invisible).
  if (!user) return null;

  // Permission check — if user lacks permission, show nothing (redirect fires
  // in the effect above).
  if (requiredPermission && !hasPermission(user.roles, requiredPermission)) {
    return null;
  }

  return <>{children}</>;
}
