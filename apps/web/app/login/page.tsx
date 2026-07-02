import type { Metadata } from "next";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = { title: "Sign In | TimeForge" };

export default function LoginPage() {
  return (
    <AuthCenteredLayout>
      <LoginForm />
    </AuthCenteredLayout>
  );
}
