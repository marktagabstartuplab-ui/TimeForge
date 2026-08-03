import type { Metadata } from "next";
import { PayrollSettingsContent } from "@/features/payroll-compliance/components/PayrollSettingsContent";

export const metadata: Metadata = { title: "Payroll Settings | HeroTime" };

/**
 * Finance view of the statutory settings. The finance shell comes from
 * app/finance/layout.tsx, so this route renders inside it rather than jumping
 * the user into the main AppShell at /admin/payroll-settings.
 */
export default function FinancePayrollSettingsPage() {
  return <PayrollSettingsContent />;
}
