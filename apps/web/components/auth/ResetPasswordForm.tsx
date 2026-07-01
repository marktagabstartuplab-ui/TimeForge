"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/PasswordField";
import { FieldError, FormBanner } from "@/components/auth/FormError";
import { ComingSoonPanel } from "@/components/auth/ComingSoonPanel";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas/auth";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const PASSWORD_HINT = "Password must consist of Capital Letter, lowercase letter, numbers, symbols.";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      if (!token) {
        setServerError("This reset link is missing or invalid. Please request a new one.");
        return;
      }
      await resetPassword(token, values.password);
      setSucceeded(true);
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

  if (succeeded) {
    return (
      <div className="space-y-6">
        <FormBanner variant="success" message="Your password has been changed. You can now sign in." />
        <BackToSignIn />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError ? <FormBanner message={serverError} /> : null}

      <div>
        <Label htmlFor="password" className="text-base font-bold text-gray-900">
          Change Password
        </Label>
        <p className="mt-1 text-xs text-gray-500">{PASSWORD_HINT}</p>
        <PasswordField
          id="password"
          autoComplete="new-password"
          placeholder="Password…"
          aria-label="New password"
          error={errors.password?.message}
          className="mt-2 h-11"
          {...registerField("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <div>
        <Label htmlFor="confirmPassword" className="text-base font-bold text-gray-900">
          Confirm Password
        </Label>
        <p className="mt-1 text-xs text-gray-500">{PASSWORD_HINT}</p>
        <PasswordField
          id="confirmPassword"
          autoComplete="new-password"
          placeholder="Password…"
          aria-label="Confirm new password"
          error={errors.confirmPassword?.message}
          className="mt-2 h-11"
          {...registerField("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" disabled={submitting} className="h-11 w-full bg-blue-600 text-base hover:bg-blue-700">
        {submitting ? "Changing…" : "Change Password"}
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
