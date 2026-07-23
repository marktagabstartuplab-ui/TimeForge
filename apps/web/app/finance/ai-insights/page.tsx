import type { Metadata } from "next";
import { FinanceAiInsightsContent } from "@/features/finance-ai/components/FinanceAiInsightsContent";

export const metadata: Metadata = { title: "AI Insights | HeroTime" };

export default function FinanceAIInsightsPage() {
  return <FinanceAiInsightsContent />;
}
