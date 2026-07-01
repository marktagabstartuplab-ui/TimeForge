import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = { title: "Waiting for Admin Approval | TimeForge" };

export default function RegistrationPendingPage() {
  return (
    <AuthCard>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Waiting for Admin Approval</h1>
        <p className="mt-2 text-sm text-gray-500">Please check your email for the confirmation</p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
