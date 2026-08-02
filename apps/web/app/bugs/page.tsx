import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { BugListContent } from "@/features/bugs/components/BugListContent";

export const metadata: Metadata = { title: "Submitted Issues | HeroTime" };

export default function BugsPage() {
  return (
    <AppShell>
      <BugListContent />
    </AppShell>
  );
}
