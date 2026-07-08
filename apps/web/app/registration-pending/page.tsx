import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { AuthCard } from "@/features/auth/components/AuthCard";

export const metadata: Metadata = { title: "Waiting for Admin Approval | TimeForge" };

export default function RegistrationPendingPage() {
  return (
    <AuthCenteredLayout>
      <AuthCard>
        <div className="py-6 text-center">
          <h1 className="text-2xl font-bold text-brand-navy">Waiting for Admin Approval</h1>
          <p className="mt-2 text-sm text-brand-muted">Please check your email for the confirmation</p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand-muted hover:text-brand-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    </AuthCenteredLayout>
  );
}
