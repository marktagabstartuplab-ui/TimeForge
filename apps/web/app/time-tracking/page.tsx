import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TimeTrackingContent } from "@/features/time-tracking/components/TimeTrackingContent";

export const metadata: Metadata = { title: "Time Tracking | TimeForge" };

export default function TimeTrackingPage() {
  return (
    <AppShell>
      <TimeTrackingContent />
    </AppShell>
  );
}
