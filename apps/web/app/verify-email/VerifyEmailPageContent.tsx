"use client";

import { useSearchParams } from "next/navigation";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { VerifyEmailContent } from "@/features/auth/components/VerifyEmailContent";

export function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <AuthCenteredLayout>
      <VerifyEmailContent token={token} />
    </AuthCenteredLayout>
  );
}
