"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { AuthCard } from "./AuthCard";
import { FieldLabel, IconInput } from "./fields";
import { PasswordField } from "./PasswordField";
import { SubmitButton } from "./SubmitButton";
import { FieldError, FormBanner } from "./FormMessages";
import { loginSchema, type LoginValues } from "../schemas/auth.schema";
import { login } from "../api/auth.service";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";

export function LoginForm() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await login(values.email, values.password);
      setSession(result.accessToken, result.user);
      router.push("/dashboard");
    } catch (err) {
      // Surface the backend's own message verbatim (e.g. "Account is not
      // active", "Email not verified", "Invalid credentials").
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <div className="mb-6 text-center">
        <h1 className="text-[26px] font-bold leading-tight text-brand-navy">Welcome back</h1>
        <p className="mt-1 text-sm text-brand-muted">Sign in to your TimeForge workspace</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError ? <FormBanner message={serverError} /> : null}

        <div>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <IconInput
            id="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="you@company.com"
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

        <SubmitButton loading={submitting} loadingText="Signing in…">
          Sign In
        </SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-[#c3c6d2]/60" />
        <span className="text-xs font-medium tracking-wide text-brand-muted">NEW HERE?</span>
        <span className="h-px flex-1 bg-[#c3c6d2]/60" />
      </div>

      <Link
        href="/register"
        className="flex h-11 w-full items-center justify-center rounded-[10px] border-2 border-brand text-[15px] font-bold text-brand transition-colors hover:bg-blue-50"
      >
        Create account
      </Link>
    </AuthCard>
  );
}
