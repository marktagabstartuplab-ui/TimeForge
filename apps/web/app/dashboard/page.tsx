"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/auth.store";

export default function DashboardPage() {
  const router = useRouter();
  const { user, clearSession } = useAuthStore();

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Logged in as {user.email}</h1>
      <p className="text-sm text-gray-500">Dashboard coming soon.</p>
      <Button onClick={handleLogout} variant="outline" className="h-11 px-6">
        Log out
      </Button>
    </div>
  );
}
