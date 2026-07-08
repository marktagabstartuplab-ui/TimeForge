import type { Metadata } from "next";
import { HRAIInsightsContent } from "@/features/hr-ai-insights/components/HRAIInsightsContent";

export const metadata: Metadata = { title: "AI Insights | TimeForge" };

export default function FinanceAIInsightsPage() {
  return <HRAIInsightsContent />;
}
