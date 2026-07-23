import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { TeamDirectoryContent } from "@/features/team-directory/components/TeamDirectoryContent";

export const metadata: Metadata = { title: "My Team | HeroTime" };

export default function TeamPage() {
  return (
    <AppShell>
      <TeamDirectoryContent />
    </AppShell>
  );
}
