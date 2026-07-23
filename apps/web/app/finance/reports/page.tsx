import type { Metadata } from "next";
import { FinanceReportsContent } from "@/features/finance-reports/components/FinanceReportsContent";

export const metadata: Metadata = { title: "Finance Reports | HeroTime" };

export default function FinanceReportsPage() {
  return <FinanceReportsContent />;
}
