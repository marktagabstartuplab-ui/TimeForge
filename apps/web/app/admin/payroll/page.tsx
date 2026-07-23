import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PayrollOversightContent } from "@/features/admin/components/PayrollOversightContent";

export const metadata: Metadata = { title: "Payroll Oversight | HeroTime" };

export default function PayrollOversightPage() {
  return (
    <AppShell>
      <PayrollOversightContent />
    </AppShell>
  );
}
