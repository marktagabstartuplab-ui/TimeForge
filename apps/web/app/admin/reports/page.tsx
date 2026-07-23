import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { ReportsDashboardContent } from "@/features/reports/components/ReportsDashboardContent";

export const metadata: Metadata = { title: "Reports & Analytics | HeroTime" };

export default function ReportsPage() {
  return (
    <AppShell>
      <ReportsDashboardContent />
    </AppShell>
  );
}
