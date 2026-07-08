import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { DashboardRouter } from "@/features/dashboard/components/DashboardRouter";

export const metadata: Metadata = { title: "Dashboard | TimeForge" };

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardRouter />
    </AppShell>
  );
}
