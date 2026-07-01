import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { ResetPasswordPageContent } from "./ResetPasswordPageContent";

export const metadata: Metadata = { title: "Change Password | TimeForge" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCenteredLayout><div /></AuthCenteredLayout>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
