import type { Metadata } from "next";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset Your Password | TimeForge" };

export default function ForgotPasswordPage() {
  return (
    <AuthCenteredLayout>
      <ForgotPasswordForm />
    </AuthCenteredLayout>
  );
}
