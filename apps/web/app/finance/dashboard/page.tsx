import type { Metadata } from "next";
import { FinanceDashboardContent } from "@/features/finance/components/FinanceDashboardContent";

export const metadata: Metadata = { title: "Finance Dashboard | TimeForge" };

export default function FinanceDashboardPage() {
  return <FinanceDashboardContent />;
}
