import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { BugDetailContent } from "@/features/bugs/components/BugDetailContent";

export const metadata: Metadata = { title: "Bug | HeroTime" };

export default async function BugDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <BugDetailContent bugId={id} />
    </AppShell>
  );
}
