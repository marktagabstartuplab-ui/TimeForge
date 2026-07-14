"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, ArrowRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthCard } from "../AuthCard";
import { FieldLabel } from "../fields";
import { PasswordField } from "../PasswordField";
import { SubmitButton } from "../SubmitButton";
import { FieldError, FormBanner } from "../FormMessages";
import {
  registerStep2Schema,
  type RegisterStep2Values,
  REQUESTABLE_ROLES,
} from "../../schemas/auth.schema";
import { ApiError } from "@/lib/api/client";

interface Props {
  onSubmit: (values: RegisterStep2Values) => Promise<void>;
  onBack: () => void;
}

export function RegisterStep2Form({ onSubmit, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterStep2Values>({
    resolver: zodResolver(registerStep2Schema),
    defaultValues: {
      password: "",
      confirmPassword: "",
      requestedRole: "EMPLOYEE",
      workCategory: "",
    },
  });

  const submit = async (values: RegisterStep2Values) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setServerError(err.details.join(" "));
      } else {
        setServerError(err instanceof ApiError ? err.message : "Something went wrong");
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-h2 text-brand-navy">Complete Registration</h1>
          <p className="text-body mt-1 text-brand-muted">Step 2 of 2</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-brand hover:underline"
        >
          Back
        </button>
      </div>

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {serverError ? <FormBanner message={serverError} /> : null}

        <div>
          <FieldLabel htmlFor="password">Create Password</FieldLabel>
          <PasswordField
            id="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="••••••••"
            aria-label="Create Password"
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
          {errors.password ? (
            <FieldError message={errors.password.message} />
          ) : (
            <p className="mt-1 text-xs text-brand-muted/80">
              At least 8 characters, with an uppercase &amp; lowercase letter, a number, and a
              special character.
            </p>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
          <PasswordField
            id="confirmPassword"
            icon={Lock}
            autoComplete="new-password"
            placeholder="••••••••"
            aria-label="Confirm Password"
            invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="requestedRole">Requested Role</FieldLabel>
            <Controller
              control={control}
              name="requestedRole"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={REQUESTABLE_ROLES.map((r) => ({ value: r.value, label: r.label }))}
                >
                  <SelectTrigger
                    id="requestedRole"
                    aria-label="Requested Role"
                    aria-invalid={Boolean(errors.requestedRole)}
                    className="h-11 w-full rounded-lg border-[#c3c6d2]"
                  >
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUESTABLE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.requestedRole ? (
              <FieldError message={errors.requestedRole.message} />
            ) : (
              <p className="mt-1 text-xs text-brand-muted/80">An admin confirms your role on approval.</p>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="workCategory">Work Category</FieldLabel>
            <Select disabled>
              <SelectTrigger
                id="workCategory"
                aria-label="Work Category"
                className="h-11 w-full rounded-[10px] border-[#c3c6d2]"
              >
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent />
            </Select>
            <p className="mt-1 text-xs text-brand-muted/80">Set later by your admin.</p>
          </div>
        </div>

        <SubmitButton loading={submitting} loadingText="Setting up…">
          Complete Setup
          <ArrowRight className="h-4 w-4" />
        </SubmitButton>

        <div className="border-t border-[#c3c6d2]/40 pt-4">
          <p className="text-center text-sm text-brand-muted">
            Having trouble?{" "}
            <Link href="?modal=support" className="font-semibold text-brand hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </form>
    </AuthCard>
  );
}
