import type { Metadata } from "next";
import { AuthCard, AuthCardHeader } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign In | TimeForge" };

export default function LoginPage() {
  return (
    <AuthCard>
      <AuthCardHeader
        align="center"
        title="Sign In"
        description="Enter your credentials to access your account."
      />
      <LoginForm />
    </AuthCard>
  );
}
