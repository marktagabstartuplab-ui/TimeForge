"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError, FormBanner } from "@/components/auth/FormError";
import { ComingSoonPanel } from "@/components/auth/ComingSoonPanel";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/schemas/auth";
import { forgotPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await forgotPassword(values.email);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        setComingSoon(true);
      } else {
        setServerError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (comingSoon) {
    return (
      <div className="space-y-6">
        <ComingSoonPanel message="This feature is coming soon." />
        <BackToSignIn />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <FormBanner
          variant="success"
          message="If an account exists for that email, a reset link is on its way."
        />
        <BackToSignIn />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError ? <FormBanner message={serverError} /> : null}

      <div>
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          aria-label="Email address"
          aria-invalid={Boolean(errors.email)}
          className="mt-1.5 h-11"
          {...registerField("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <Button type="submit" disabled={submitting} className="h-11 w-full bg-blue-600 text-base hover:bg-blue-700">
        {submitting ? "Sending…" : "Send reset link"}
      </Button>

      <div className="text-center">
        <BackToSignIn />
      </div>
    </form>
  );
}

function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to sign in
    </Link>
  );
}
