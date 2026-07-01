"use client";

import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <AuthCard>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
