import type { Metadata } from "next";
import { AuthCard, AuthCardHeader } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset Your Password | TimeForge" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <AuthCardHeader
        title="Reset your password"
        description="Enter your email address and we'll send you a link to reset your password."
      />
      <ForgotPasswordForm />
    </AuthCard>
  );
}
