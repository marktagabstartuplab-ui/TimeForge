import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TeamKpiDashboardContent } from "@/features/reports/components/TeamKpiDashboardContent";

export const metadata: Metadata = { title: "KPI Dashboard | TimeForge" };

export default function KpiDashboardPage() {
  return (
    <AppShell>
      <TeamKpiDashboardContent />
    </AppShell>
  );
}
