import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { HRAIInsightsContent } from "@/features/hr-ai-insights/components/HRAIInsightsContent";

export const metadata: Metadata = { title: "Admin AI Insights | HeroTime" };

export default function HRAIInsightsPage() {
  return (
    <AppShell>
      <HRAIInsightsContent />
    </AppShell>
  );
}
