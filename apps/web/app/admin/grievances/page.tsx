"use client";

import { AppShell } from "@/features/app-shell/components/AppShell";
import { HrGrievanceInboxContent } from "@/features/grievances/components/HrGrievanceInboxContent";

export default function AdminGrievancesPage() {
  return (
    <AppShell>
      <HrGrievanceInboxContent />
    </AppShell>
  );
}
