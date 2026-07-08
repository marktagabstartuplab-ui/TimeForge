import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { ReportsContent } from "@/features/reports/components/ReportsContent";

export const metadata: Metadata = { title: "Reports | TimeForge" };

export default function ReportsPage() {
  return (
    <AppShell>
      <ReportsContent />
    </AppShell>
  );
}
