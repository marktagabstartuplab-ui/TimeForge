import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TimesheetsContent } from "@/features/timesheets/components/TimesheetsContent";

export const metadata: Metadata = { title: "Time Sheet | TimeForge" };

export default function TimesheetsPage() {
  return (
    <AppShell>
      <TimesheetsContent />
    </AppShell>
  );
}
