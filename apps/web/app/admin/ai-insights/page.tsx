import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { HRAIInsightsContent } from "@/features/hr-ai-insights/components/HRAIInsightsContent";

export const metadata: Metadata = { title: "HR AI Insights | TimeForge" };

export default function HRAIInsightsPage() {
  return (
    <AppShell>
      <HRAIInsightsContent />
    </AppShell>
  );
}
