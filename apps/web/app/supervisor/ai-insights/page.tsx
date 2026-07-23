import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { SupervisorAiInsightsContent } from "@/features/supervisor-ai/components/SupervisorAiInsightsContent";

export const metadata: Metadata = { title: "AI Insights | HeroTime" };

export default function SupervisorAiInsightsPage() {
  return (
    <AppShell>
      <SupervisorAiInsightsContent />
    </AppShell>
  );
}
