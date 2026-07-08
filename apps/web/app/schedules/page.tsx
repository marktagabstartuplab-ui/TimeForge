import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { SchedulesContent } from "@/features/schedules/components/SchedulesContent";

export const metadata: Metadata = { title: "Team Schedules | TimeForge" };

export default function SchedulesPage() {
  return (
    <AppShell>
      <SchedulesContent />
    </AppShell>
  );
}
