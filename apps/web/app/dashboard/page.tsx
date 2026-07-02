import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { DashboardContent } from "@/features/dashboard/components/DashboardContent";

export const metadata: Metadata = { title: "Dashboard | TimeForge" };

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}
