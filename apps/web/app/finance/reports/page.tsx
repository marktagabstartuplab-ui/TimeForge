import type { Metadata } from "next";
import { ReportsDashboardContent } from "@/features/reports/components/ReportsDashboardContent";

export const metadata: Metadata = { title: "Reports & Analytics | TimeForge" };

export default function FinanceReportsPage() {
  return <ReportsDashboardContent />;
}
