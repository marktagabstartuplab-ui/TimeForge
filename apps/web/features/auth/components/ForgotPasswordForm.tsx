"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthCard } from "./AuthCard";
import { LockBadge, BackToSignIn } from "./AuthCardBits";
import { FieldLabel, IconInput } from "./fields";
import { SubmitButton } from "./SubmitButton";
import { FieldError, FormBanner } from "./FormMessages";
import { ComingSoonPanel } from "./ComingSoonPanel";
import { forgotPasswordSchema, type ForgotPasswordValues } from "../schemas/auth.schema";
import { forgotPassword } from "../api/auth.service";
import { ApiError } from "@/lib/api/client";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);

  const {
    register,
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

  return (
    <AuthCard>
      <LockBadge />
      <h1 className="text-2xl font-bold text-brand-navy">Reset your password</h1>
      <p className="mt-1.5 text-sm text-brand-muted">
        Enter your email address and we&apos;ll send you a link to reset your password
      </p>

      {comingSoon ? (
        <div className="mt-6 space-y-6">
          <ComingSoonPanel />
          <BackToSignIn />
        </div>
      ) : submitted ? (
        <div className="mt-6 space-y-6">
          <FormBanner
            variant="success"
            message="If an account exists for that email, a reset link is on its way."
          />
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
          {serverError ? <FormBanner message={serverError} /> : null}
          <div>
            <FieldLabel htmlFor="email">Email Address</FieldLabel>
            <IconInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder="alex@company.com"
              aria-label="Email Address"
              invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <SubmitButton loading={submitting} loadingText="Sending…">
            Send link
          </SubmitButton>
          <BackToSignIn />
        </form>
      )}
    </AuthCard>
  );
}
