import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { AttendanceReportsContent } from "@/features/attendance-reports/components/AttendanceReportsContent";

export const metadata: Metadata = { title: "Attendance Reports | TimeForge" };

export default function AttendanceReportsPage() {
  return (
    <AppShell>
      <AttendanceReportsContent />
    </AppShell>
  );
}
