"use client";

import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { User, Mail, Phone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthCard } from "../AuthCard";
import { FieldLabel, IconInput } from "../fields";
import { SubmitButton } from "../SubmitButton";
import { FieldError } from "../FormMessages";
import { registerStep1Schema, type RegisterStep1Values } from "../../schemas/auth.schema";
import { fetchDepartments } from "../../api/auth.service";

interface Props {
  defaultValues: RegisterStep1Values;
  onNext: (values: RegisterStep1Values) => void;
}

export function RegisterStep1Form({ defaultValues, onNext }: Props) {
  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ["auth", "departments"],
    queryFn: fetchDepartments,
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterStep1Values>({
    resolver: zodResolver(registerStep1Schema),
    defaultValues,
  });

  return (
    <AuthCard>
      <div className="mb-6">
        <h1 className="text-h2 text-brand-navy">Create your account</h1>
        <p className="text-body mt-1 text-brand-muted">Step 1 of 2</p>
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
          <FieldLabel htmlFor="email">Email Address</FieldLabel>
          <IconInput
            id="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="alex@company.com"
            aria-label="Email Address"
            invalid={Boolean(errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        {/* Not in the Figma, but the backend RegisterDto requires a phone. */}
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
          <FieldError message={errors.phone?.message} />
        </div>

        <div>
          <FieldLabel htmlFor="departmentId">Department</FieldLabel>
          <Controller
            control={control}
            name="departmentId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                // `items` lets the closed trigger resolve the label for a
                // prefilled value (otherwise it renders the raw id).
                items={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
              >
                <SelectTrigger
                  id="departmentId"
                  aria-label="Department"
                  aria-invalid={Boolean(errors.departmentId)}
                  className="h-11 w-full rounded-lg border-[#c3c6d2]"
                >
                  <SelectValue placeholder={departmentsLoading ? "Loading…" : "Select..."} />
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

        <div className="flex items-start gap-2 pt-1">
          <Controller
            control={control}
            name="agreeToTerms"
            render={({ field }) => (
              <Checkbox
                id="step1-agreeToTerms"
                className="mt-0.5"
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <label htmlFor="step1-agreeToTerms" className="text-xs leading-relaxed text-brand-muted">
            I agree to the{" "}
            <Link href="?modal=terms" className="font-semibold text-brand hover:underline">
              Terms of Service
            </Link>{" "}
            and acknowledge the{" "}
            <Link href="?modal=privacy" className="font-semibold text-brand hover:underline">
              Privacy Policy
            </Link>
            .
          </label>
        </div>
        <FieldError message={errors.agreeToTerms?.message} />

        <SubmitButton>Create Account</SubmitButton>

        <div className="border-t border-[#c3c6d2]/40 pt-4">
          <p className="text-center text-sm text-brand-muted">
            Having trouble?{" "}
            <Link href="/support" className="font-semibold text-brand hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </form>
    </AuthCard>
  );
}
