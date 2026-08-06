import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { EmployeeRelationsContent } from "@/features/employee-relations/components/EmployeeRelationsContent";

export const metadata: Metadata = { title: "Employee Relations | HeroTime" };

export default function EmployeeRelationsPage() {
  return (
    <AppShell>
      <EmployeeRelationsContent />
    </AppShell>
  );
}
