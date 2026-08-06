import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { MyHrRecordsContent } from "@/features/employee-relations/components/MyHrRecordsContent";

export const metadata: Metadata = { title: "My HR Records | HeroTime" };

export default function MyHrRecordsPage() {
  return (
    <AppShell>
      <MyHrRecordsContent />
    </AppShell>
  );
}
