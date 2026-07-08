"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthCard } from "./AuthCard";
import { LockBadge, BackToSignIn } from "./AuthCardBits";
import { FieldLabel } from "./fields";
import { PasswordField } from "./PasswordField";
import { SubmitButton } from "./SubmitButton";
import { FieldError, FormBanner } from "./FormMessages";
import { ComingSoonPanel } from "./ComingSoonPanel";
import { changePasswordSchema, type ChangePasswordValues } from "../schemas/auth.schema";
import { resetPassword } from "../api/auth.service";
import { ApiError } from "@/lib/api/client";

export function ChangePasswordForm({ token }: { token: string | null }) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ChangePasswordValues) => {
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

  return (
    <AuthCard>
      <LockBadge />

      {comingSoon ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-navy">Change Password</h1>
            <p className="mt-1.5 text-sm text-brand-muted">
              Password reset isn&apos;t available just yet.
            </p>
          </div>
          <ComingSoonPanel />
          <BackToSignIn />
        </div>
      ) : succeeded ? (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-brand-navy">Change Password</h1>
          <FormBanner variant="success" message="Your password has been changed. You can now sign in." />
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {serverError ? <FormBanner message={serverError} /> : null}

          <div>
            <h1 className="text-2xl font-bold text-brand-navy">Change Password</h1>
            <p className="mt-1.5 text-sm text-brand-muted">
              Password must consist of Capital Letter, lowercase letter, numbers, symbols.
            </p>
            <div className="mt-3">
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <PasswordField
                id="password"
                autoComplete="new-password"
                placeholder="••••••••••"
                aria-label="New password"
                invalid={Boolean(errors.password)}
                {...register("password")}
              />
              <FieldError message={errors.password?.message} />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-brand-navy">Confirm Password</h2>
            <div className="mt-3">
              <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
              <PasswordField
                id="confirmPassword"
                autoComplete="new-password"
                placeholder="••••••••••"
                aria-label="Confirm new password"
                invalid={Boolean(errors.confirmPassword)}
                {...register("confirmPassword")}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
          </div>

          <SubmitButton loading={submitting} loadingText="Saving…">
            Confirm
          </SubmitButton>
          <BackToSignIn />
        </form>
      )}
    </AuthCard>
  );
}
