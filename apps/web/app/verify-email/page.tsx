import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { VerifyEmailPageContent } from "./VerifyEmailPageContent";

export const metadata: Metadata = { title: "Verify Email | HeroTime" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthCenteredLayout><div /></AuthCenteredLayout>}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}
