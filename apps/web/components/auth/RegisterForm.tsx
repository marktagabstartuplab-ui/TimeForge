"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PasswordField } from "@/components/auth/PasswordField";
import { FieldError, FormBanner } from "@/components/auth/FormError";
import { registerSchema, type RegisterValues } from "@/lib/schemas/auth";
import { register as registerUser, fetchDepartments } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function RegisterForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ["auth", "departments"],
    queryFn: fetchDepartments,
  });

  const {
    register: registerField,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      departmentId: "",
      jobTitle: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await registerUser({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        jobTitle: values.jobTitle,
        departmentId: values.departmentId,
      });
      // Never auto-login and never create a session on register — the user
      // lands on the pending-approval screen and must sign in later once an
      // admin activates the account.
      router.push("/registration-pending");
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setServerError(err.details.join(" "));
      } else {
        setServerError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError ? <FormBanner message={serverError} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            placeholder="Jane"
            aria-label="First name"
            aria-invalid={Boolean(errors.firstName)}
            className="mt-1.5 h-11"
            {...registerField("firstName")}
          />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div>
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            placeholder="Smith"
            aria-label="Last name"
            aria-invalid={Boolean(errors.lastName)}
            className="mt-1.5 h-11"
            {...registerField("lastName")}
          />
          <FieldError message={errors.lastName?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          placeholder="jane.smith@company.com"
          aria-label="Work email"
          aria-invalid={Boolean(errors.email)}
          className="mt-1.5 h-11"
          {...registerField("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <div>
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          aria-label="Phone number"
          aria-invalid={Boolean(errors.phone)}
          className="mt-1.5 h-11"
          {...registerField("phone")}
        />
        <FieldError message={errors.phone?.message} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="departmentId">Department</Label>
          <Controller
            control={control}
            name="departmentId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="departmentId"
                  aria-label="Department"
                  aria-invalid={Boolean(errors.departmentId)}
                  className="mt-1.5 h-11 w-full"
                >
                  <SelectValue placeholder={departmentsLoading ? "Loading…" : "Select department"} />
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.departmentId?.message} />
        </div>
        <div>
          <Label htmlFor="jobTitle">Job title</Label>
          <Input
            id="jobTitle"
            placeholder="Software Engineer"
            aria-label="Job title"
            aria-invalid={Boolean(errors.jobTitle)}
            className="mt-1.5 h-11"
            {...registerField("jobTitle")}
          />
          <FieldError message={errors.jobTitle?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <PasswordField
          id="password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          aria-label="Password"
          error={errors.password?.message}
          className="mt-1.5 h-11"
          {...registerField("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordField
          id="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat your password"
          aria-label="Confirm password"
          error={errors.confirmPassword?.message}
          className="mt-1.5 h-11"
          {...registerField("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      <p className="text-xs text-gray-500">
        By registering, you agree to TimeForge&apos;s{" "}
        <Link href="/terms" className="text-blue-600 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-blue-600 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <Button type="submit" disabled={submitting} className="h-11 w-full bg-blue-600 text-base hover:bg-blue-700">
        {submitting ? "Submitting…" : "Submit registration"}
      </Button>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
