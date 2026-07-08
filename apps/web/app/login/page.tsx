import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthSplitLayout } from "@/features/auth/components/AuthSplitLayout";
import { AuthAside } from "@/features/auth/components/AuthAside";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = { title: "Sign In | TimeForge" };

// The landing page: brand aside on the left, sign-in card on the right.
// There is no separate marketing page — "/" redirects here.
export default function LoginPage() {
  return (
    <AuthSplitLayout aside={<AuthAside />}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
