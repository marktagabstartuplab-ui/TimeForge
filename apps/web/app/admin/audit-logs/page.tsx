import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { AdminOnly } from "@/features/admin/components/AdminOnly";
import { AuditLogsContent } from "@/features/admin/components/AuditLogsContent";

export const metadata: Metadata = { title: "Audit Logs | HeroTime" };

export default function AuditLogsPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AuditLogsContent />
      </AdminOnly>
    </AppShell>
  );
}
