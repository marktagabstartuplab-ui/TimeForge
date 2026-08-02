import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { ShiftOverridesContent } from "@/features/shift-overrides/components/ShiftOverridesContent";

export const metadata: Metadata = { title: "Shift Overrides | HeroTime" };

export default function ShiftOverridesPage() {
  return (
    <AppShell>
      <ShiftOverridesContent />
    </AppShell>
  );
}
