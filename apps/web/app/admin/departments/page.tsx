import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { OrgManagementContent } from "@/features/org-management/components/OrgManagementContent";

export const metadata: Metadata = { title: "Departments | HeroTime" };

export default function DepartmentsPage() {
  return (
    <AppShell>
      <OrgManagementContent />
    </AppShell>
  );
}
