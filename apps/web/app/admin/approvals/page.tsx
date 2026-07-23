import type { Metadata } from "next";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { AccountApprovalsContent } from "@/features/account-approvals/components/AccountApprovalsContent";

export const metadata: Metadata = { title: "Approvals | HeroTime" };

export default function ApprovalsPage() {
  return (
    <AppShell>
      <AccountApprovalsContent />
    </AppShell>
  );
}
