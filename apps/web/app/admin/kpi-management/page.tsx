import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { KpiManagementContent } from "@/features/admin/components/KpiManagementContent";

export const metadata: Metadata = { title: "KPI Management | TimeForge" };

export default function KpiManagementPage() {
  return (
    <AppShell>
      <KpiManagementContent />
    </AppShell>
  );
}
