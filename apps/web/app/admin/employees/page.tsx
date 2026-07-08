import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { EmployeeManagementContent } from "@/features/employee-management/components/EmployeeManagementContent";

export const metadata: Metadata = { title: "Employees | TimeForge" };

export default function EmployeesPage() {
  return (
    <AppShell>
      <EmployeeManagementContent />
    </AppShell>
  );
}
