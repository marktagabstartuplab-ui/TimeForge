import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TimeTrackingRouter } from "@/features/time-tracking/components/TimeTrackingRouter";

export const metadata: Metadata = { title: "Daily Scrum | HeroTime" };

export default function TimeTrackingPage() {
  return (
    <AppShell>
      <TimeTrackingRouter />
    </AppShell>
  );
}
