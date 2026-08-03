import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { StatutoryReportsContent } from "@/features/payroll-compliance/components/StatutoryReportsContent";

export const metadata: Metadata = { title: "Statutory Reports | HeroTime" };

/**
 * Admin/HR view of the statutory reports. Same content as
 * /finance/statutory-reports, rendered in the main shell — Finance runs in its
 * own shell, so each side needs its own route (mirrors /hr/payroll-processing
 * vs /finance/payroll-processing).
 */
export default function StatutoryReportsPage() {
  return (
    <AppShell>
      <StatutoryReportsContent />
    </AppShell>
  );
}
