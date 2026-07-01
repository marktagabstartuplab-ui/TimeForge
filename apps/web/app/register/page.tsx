import type { Metadata } from "next";
import { AuthCard, AuthCardHeader } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Create Account | TimeForge" };

export default function RegisterPage() {
  return (
    <AuthCard className="max-w-lg">
      <AuthCardHeader
        title="Create your account"
        description="Submit your registration and an admin will review and approve your access."
      />
      <RegisterForm />
    </AuthCard>
  );
}
