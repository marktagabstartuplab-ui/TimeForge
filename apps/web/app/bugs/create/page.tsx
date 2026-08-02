import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { BugForm } from "@/features/bugs/components/BugForm";

export const metadata: Metadata = { title: "Report a Bug | HeroTime" };

export default function ReportBugPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Report a Bug"
          subtitle="Tell us what broke. The more specific you are, the faster it gets fixed."
        />
        <BugForm />
      </div>
    </AppShell>
  );
}
