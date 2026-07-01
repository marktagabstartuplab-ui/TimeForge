"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PasswordField } from "@/components/auth/PasswordField";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { FieldError, FormBanner } from "@/components/auth/FormError";
import { loginSchema, type LoginValues } from "@/lib/schemas/auth";
import { login, type AuthUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth.store";

export function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await login(values.email, values.password);
      const user: AuthUser = result.user;
      setSession(result.accessToken, user);
      router.push("/dashboard");
    } catch (err) {
      // Surface the backend's own message verbatim (e.g. "Account is not
      // active", "Email not verified", "Invalid credentials") — never
      // reinterpreted or bypassed client-side.
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError ? <FormBanner message={serverError} /> : null}

      <div>
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          aria-label="Email Address"
          aria-invalid={Boolean(errors.email)}
          className="mt-1.5 h-11"
          {...registerField("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Forgot Password?
          </Link>
        </div>
        <PasswordField
          id="password"
          autoComplete="current-password"
          aria-label="Password"
          error={errors.password?.message}
          className="mt-1.5 h-11"
          {...registerField("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="rememberMe"
          render={({ field }) => (
            <Checkbox
              id="rememberMe"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <Label htmlFor="rememberMe" className="cursor-pointer text-sm font-normal text-gray-600">
          Remember me for 30 days
        </Label>
      </div>

      <Button type="submit" disabled={submitting} className="h-11 w-full bg-blue-600 text-base hover:bg-blue-700">
        {submitting ? "Logging in…" : "Log In"}
      </Button>

      <div className="relative flex items-center py-1">
        <Separator className="flex-1" />
        <span className="px-3 text-xs uppercase text-gray-400">Or</span>
        <Separator className="flex-1" />
      </div>

      <GoogleButton />

      <p className="text-center text-sm text-gray-500">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
          Sign Up
        </Link>
      </p>
    </form>
  );
}
