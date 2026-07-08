"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

/** Gates admin-only page content — redirects non-admins back to /dashboard. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("ADMIN") ?? false;

  useEffect(() => {
    if (user && !isAdmin) router.replace("/dashboard");
  }, [user, isAdmin, router]);

  if (!user || !isAdmin) return null;
  return <>{children}</>;
}
