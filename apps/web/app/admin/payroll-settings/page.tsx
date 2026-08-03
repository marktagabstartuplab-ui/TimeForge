import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PayrollSettingsContent } from "@/features/payroll-compliance/components/PayrollSettingsContent";

export const metadata: Metadata = { title: "Payroll Settings | HeroTime" };

export default function PayrollSettingsPage() {
  return (
    <AppShell>
      <PayrollSettingsContent />
    </AppShell>
  );
}
