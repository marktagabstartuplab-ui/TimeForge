import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TimesheetsRouter } from "@/features/timesheets/components/TimesheetsRouter";

export const metadata: Metadata = { title: "Time Sheet | HeroTime" };

export default function TimesheetsPage() {
  return (
    <AppShell>
      <TimesheetsRouter />
    </AppShell>
  );
}
