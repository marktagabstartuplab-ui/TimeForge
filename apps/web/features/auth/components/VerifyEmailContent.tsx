"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MailCheck, MailWarning } from "lucide-react";
import { AuthCard } from "./AuthCard";
import { BackToSignIn } from "./AuthCardBits";
import { FormBanner } from "./FormMessages";
import { verifyEmail } from "../api/auth.service";
import { ApiError } from "@/lib/api/client";

type Status = "verifying" | "success" | "error";

export function VerifyEmailContent({ token }: { token: string | null }) {
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token ? null : "This verification link is missing or invalid.",
  );
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setErrorMessage(err instanceof ApiError ? err.message : "This verification link is invalid or has expired.");
        setStatus("error");
      });
  }, [token]);

  return (
    <AuthCard>
      {status === "verifying" ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e6eef1] text-brand-navy">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold text-brand-navy">Verifying your email…</h1>
          <p className="text-sm text-brand-muted">Just a moment while we confirm your verification link.</p>
        </div>
      ) : status === "success" ? (
        <div className="space-y-6">
          <span className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-green-600">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold text-brand-navy">Email Verified</h1>
          <FormBanner
            variant="success"
            message="Your email address has been verified. You can now sign in once your account is approved."
          />
          <BackToSignIn />
        </div>
      ) : (
        <div className="space-y-6">
          <span className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
            <MailWarning className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold text-brand-navy">Verification Failed</h1>
          <FormBanner message={errorMessage ?? "This verification link is invalid or has expired."} />
          <BackToSignIn />
        </div>
      )}
    </AuthCard>
  );
}
