import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { SecurityOversightContent } from "@/features/admin/components/SecurityOversightContent";

export const metadata: Metadata = { title: "Security Logs | TimeForge" };

export default function SecurityLogsPage() {
  return (
    <AppShell>
      <SecurityOversightContent />
    </AppShell>
  );
}
