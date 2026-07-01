import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordPageContent } from "./ResetPasswordPageContent";

export const metadata: Metadata = { title: "Change Password | TimeForge" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard>Loading…</AuthCard>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
