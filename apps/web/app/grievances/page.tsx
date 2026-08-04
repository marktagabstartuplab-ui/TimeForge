"use client";

import { AppShell } from "@/features/app-shell/components/AppShell";
import { GrievanceTrackerContent } from "@/features/grievances/components/GrievanceTrackerContent";

export default function GrievancesPage() {
  return (
    <AppShell>
      <GrievanceTrackerContent />
    </AppShell>
  );
}
