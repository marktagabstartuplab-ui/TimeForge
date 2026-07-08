import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PerformanceOversightContent } from "@/features/reports/components/PerformanceOversightContent";

export const metadata: Metadata = { title: "Performance Insights | TimeForge" };

export default function PerformancePage() {
  return (
    <AppShell>
      <PerformanceOversightContent />
    </AppShell>
  );
}
