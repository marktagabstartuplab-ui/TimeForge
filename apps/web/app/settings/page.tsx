import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { SettingsContent } from "@/features/settings/components/SettingsContent";

export const metadata: Metadata = { title: "Settings | HeroTime" };

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}
