import type { Metadata } from "next";
import { StatutoryReportsContent } from "@/features/payroll-compliance/components/StatutoryReportsContent";

export const metadata: Metadata = { title: "Statutory Reports | HeroTime" };

export default function StatutoryReportsPage() {
  return <StatutoryReportsContent />;
}
