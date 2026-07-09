import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { SupervisorLeaveContent } from "@/features/supervisor-leave/components/SupervisorLeaveContent";

export const metadata: Metadata = { title: "Leave Management | TimeForge" };

export default function SupervisorLeavePage() {
  return (
    <AppShell>
      <SupervisorLeaveContent />
    </AppShell>
  );
}
