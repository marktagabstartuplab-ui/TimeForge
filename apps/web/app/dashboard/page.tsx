"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { logout } from "@/features/auth/api/auth.service";

export default function DashboardPage() {
  const router = useRouter();
  const { user, clearSession } = useAuth();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f2f2f2] px-4 text-center">
      <h1 className="text-2xl font-bold text-brand-navy">Logged in as {user.email}</h1>
      <p className="text-sm text-brand-muted">Dashboard coming soon.</p>
      <button
        onClick={handleLogout}
        className="h-11 rounded-[10px] border border-[#c3c6d2] bg-white px-6 text-sm font-medium text-brand-navy hover:bg-[#f6f3f4]"
      >
        Log out
      </button>
    </div>
  );
}
