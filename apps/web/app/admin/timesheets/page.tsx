import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { HRTimesheetsContent } from "@/features/hr-timesheets/components/HRTimesheetsContent";

export const metadata: Metadata = { title: "Timesheet Review | TimeForge" };

export default function HRTimesheetsPage() {
  return (
    <AppShell>
      <HRTimesheetsContent />
    </AppShell>
  );
}
