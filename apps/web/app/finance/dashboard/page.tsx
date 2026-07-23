import type { Metadata } from "next";
import { FinanceDashboardContent } from "@/features/finance/components/FinanceDashboardContent";

export const metadata: Metadata = { title: "Finance Dashboard | HeroTime" };

export default function FinanceDashboardPage() {
  return <FinanceDashboardContent />;
}
