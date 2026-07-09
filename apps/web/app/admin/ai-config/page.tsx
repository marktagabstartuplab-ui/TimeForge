import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { AiConfigContent } from "@/features/admin/components/AiConfigContent";

export const metadata: Metadata = { title: "AI Configuration | TimeForge" };

export default function AiConfigPage() {
  return (
    <AppShell>
      <AiConfigContent />
    </AppShell>
  );
}
