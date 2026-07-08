import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TeamProductivityReportContent } from "@/features/reports/components/TeamProductivityReportContent";

export const metadata: Metadata = { title: "Team Productivity Report | TimeForge" };

export default function ProductivityReportPage() {
  return (
    <AppShell>
      <TeamProductivityReportContent />
    </AppShell>
  );
}
