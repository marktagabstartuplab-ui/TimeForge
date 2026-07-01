"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, Mail, Building2, Phone } from "lucide-react";
import { AuthCard } from "../AuthCard";
import { FieldLabel, IconInput } from "../fields";
import { SubmitButton } from "../SubmitButton";
import { FieldError } from "../FormMessages";
import { registerStep1Schema, type RegisterStep1Values } from "../../schemas/auth.schema";

interface Props {
  defaultValues: RegisterStep1Values;
  onNext: (values: RegisterStep1Values) => void;
}

export function RegisterStep1Form({ defaultValues, onNext }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterStep1Values>({
    resolver: zodResolver(registerStep1Schema),
    defaultValues,
  });

  return (
    <AuthCard>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Create your account</h1>
        <p className="mt-1 text-sm text-brand-muted">Step 1 of 2</p>
      </div>

      <form onSubmit={handleSubmit(onNext)} noValidate className="space-y-4">
        <div>
          <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
          <IconInput
            id="fullName"
            icon={User}
            autoComplete="name"
            placeholder="Alex Johnson"
            aria-label="Full Name"
            invalid={Boolean(errors.fullName)}
            {...register("fullName")}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        <div>
          <FieldLabel htmlFor="email">Work Email</FieldLabel>
          <IconInput
            id="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="alex@company.com"
            aria-label="Work Email"
            invalid={Boolean(errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <FieldLabel htmlFor="companyName">Company Name</FieldLabel>
          <IconInput
            id="companyName"
            icon={Building2}
            placeholder="Acme Corp"
            aria-label="Company Name"
            disabled
            {...register("companyName")}
          />
          <p className="mt-1 text-xs text-brand-muted/80">Assigned by your workspace — not stored yet.</p>
        </div>

        <div>
          <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
          <IconInput
            id="phone"
            type="tel"
            icon={Phone}
            autoComplete="tel"
            placeholder="09123456789"
            aria-label="Phone Number"
            invalid={Boolean(errors.phone)}
            {...register("phone")}
          />
          {errors.phone ? (
            <FieldError message={errors.phone.message} />
          ) : (
            <p className="mt-1 text-xs text-brand-muted/80">Must be at least 8 characters long.</p>
          )}
        </div>

        <SubmitButton>Create Free Account</SubmitButton>

        <p className="text-center text-xs text-brand-muted">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="font-semibold text-brand hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-brand hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
