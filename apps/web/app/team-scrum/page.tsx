import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TeamScrumSubmissionsContent } from "@/features/scrum-management/components/TeamScrumSubmissionsContent";

export const metadata: Metadata = { title: "Team Scrum Submissions | TimeForge" };

export default function TeamScrumPage() {
  return (
    <AppShell>
      <TeamScrumSubmissionsContent />
    </AppShell>
  );
}
