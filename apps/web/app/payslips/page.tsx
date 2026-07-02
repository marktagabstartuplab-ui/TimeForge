import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PayslipsContent } from "@/features/payslips/components/PayslipsContent";

export const metadata: Metadata = { title: "Payslips | TimeForge" };

export default function PayslipsPage() {
  return (
    <AppShell>
      <PayslipsContent />
    </AppShell>
  );
}
