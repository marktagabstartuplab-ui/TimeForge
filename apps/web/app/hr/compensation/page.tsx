import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { CompensationBenefitsContent } from "@/features/compensation/components/CompensationBenefitsContent";

export const metadata: Metadata = { title: "Compensation & Benefits | HeroTime" };

export default function CompensationBenefitsPage() {
  return (
    <AppShell>
      <CompensationBenefitsContent />
    </AppShell>
  );
}
