import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PayrollProcessingContent } from "@/features/payroll-processing/components/PayrollProcessingContent";

export const metadata: Metadata = { title: "Payroll Processing | HeroTime" };

export default function PayrollProcessingPage() {
  return (
    <AppShell>
      <PayrollProcessingContent />
    </AppShell>
  );
}
