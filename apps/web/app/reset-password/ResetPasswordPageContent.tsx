"use client";

import { useSearchParams } from "next/navigation";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";

export function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <AuthCenteredLayout>
      <ChangePasswordForm token={token} />
    </AuthCenteredLayout>
  );
}
