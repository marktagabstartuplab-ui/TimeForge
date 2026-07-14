import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { DepartmentDetailContent } from "@/features/org-management/components/DepartmentDetailContent";

export const metadata: Metadata = { title: "Department | TimeForge" };

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <DepartmentDetailContent departmentId={id} />
    </AppShell>
  );
}
