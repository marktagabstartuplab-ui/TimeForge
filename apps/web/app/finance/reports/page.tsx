import type { Metadata } from "next";
import { FinanceReportsContent } from "@/features/finance-reports/components/FinanceReportsContent";

export const metadata: Metadata = { title: "Finance Reports | TimeForge" };

export default function FinanceReportsPage() {
  return <FinanceReportsContent />;
}
