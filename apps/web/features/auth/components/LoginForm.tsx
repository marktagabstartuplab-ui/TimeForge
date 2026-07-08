"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthCard } from "./AuthCard";
import { FieldLabel, IconInput } from "./fields";
import { PasswordField } from "./PasswordField";
import { SubmitButton } from "./SubmitButton";
import { FieldError, FormBanner } from "./FormMessages";
import { loginSchema, type LoginValues } from "../schemas/auth.schema";
import { login } from "../api/auth.service";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";

/**
 * "Remember me for 30 days" — the login API has no rememberMe flag (session
 * length is fixed by the backend refresh-token TTL), so this remembers the
 * email client-side for 30 days and prefills it on the next visit.
 * TODO: pass a rememberMe flag to POST /auth/login if the backend adds one.
 */
const REMEMBER_KEY = "timeforge.remembered-email";

function readRememberedEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { email?: unknown }).email !== "string" ||
      typeof (parsed as { expiresAt?: unknown }).expiresAt !== "number"
    ) {
      return null;
    }
    const { email, expiresAt } = parsed as { email: string; expiresAt: number };
    return Date.now() < expiresAt ? email : null;
  } catch {
    return null;
  }
}

function persistRememberedEmail(email: string, remember: boolean): void {
  if (remember) {
    window.localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({ email, expiresAt: Date.now() + 30 * 86_400_000 }),
    );
  } else {
    window.localStorage.removeItem(REMEMBER_KEY);
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  // Set by RegisterWizard after a successful signup: prefill the new
  // account's email and confirm the registration above the form.
  const justRegistered = searchParams.get("registered") === "1";
  const emailParam = searchParams.get("email");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: emailParam ?? "", password: "" },
  });

  // Prefill a remembered email after mount (reading localStorage during
  // render would mismatch the SSR output); an explicit ?email= param wins.
  // Deferred via a zero timeout — runs even in background tabs, and keeps
  // setState out of the synchronous effect body.
  useEffect(() => {
    if (emailParam) return;
    const id = window.setTimeout(() => {
      const remembered = readRememberedEmail();
      if (remembered) {
        setValue("email", remembered);
        setRememberMe(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [emailParam, setValue]);

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await login(values.email, values.password);
      persistRememberedEmail(values.email, rememberMe);
      setSession(result.accessToken, result.user);
      router.push("/dashboard");
    } catch (err) {
      // Surface the backend's own message verbatim (e.g. "Email not verified",
      // "Invalid credentials"), except for the pending-approval case which gets
      // a user-friendly multi-line replacement.
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      if (
        msg.toLowerCase().includes("awaiting administrator approval") ||
        msg.toLowerCase().includes("account is not active")
      ) {
        setServerError(
          "Your account is awaiting administrator approval. Please check your email for updates. You will receive another email once your account has been approved."
        );
      } else {
        setServerError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <div className="mb-6 text-center">
        <h1 className="text-h2 text-brand-navy">Welcome back</h1>
        <p className="text-body mt-1 text-brand-muted">Access your workforce workspace</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError ? (
          <FormBanner message={serverError} />
        ) : justRegistered ? (
          <FormBanner
            variant="success"
            message={
              <>
                <p className="font-bold">✓ Account created successfully!</p>
                <p className="mt-1">A confirmation email has been sent to your Gmail.</p>
                <p className="mt-1">Your account is currently waiting for administrator approval.</p>
                <p className="mt-1">You will receive another email once your account has been approved.</p>
              </>
            }
          />
        ) : null}

        <div>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <IconInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder="alex.johnson@company.com"
            aria-label="Email address"
            invalid={Boolean(errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordField
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-label="Password"
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 pt-1">
          <Checkbox
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
            aria-label="Remember me for 30 days"
          />
          <span className="text-sm text-brand-ink">Remember me for 30 days</span>
        </label>

        <SubmitButton loading={submitting} loadingText="Signing in…">
          Sign In
        </SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-brand-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-brand hover:underline">
          Register your team
        </Link>
      </p>
    </AuthCard>
  );
}
