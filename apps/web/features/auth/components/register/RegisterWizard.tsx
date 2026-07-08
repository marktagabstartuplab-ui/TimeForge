"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthSplitLayout } from "../AuthSplitLayout";
import { AuthAside } from "../AuthAside";
import { RegisterStep1Form } from "./RegisterStep1Form";
import { RegisterStep2Form } from "./RegisterStep2Form";
import { register as registerUser } from "../../api/auth.service";
import type { RegisterStep1Values, RegisterStep2Values } from "../../schemas/auth.schema";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() ?? fullName.trim();
  const lastName = parts.join(" ") || firstName;
  return { firstName, lastName };
}

const emptyStep1: RegisterStep1Values = {
  fullName: "",
  email: "",
  phone: "",
  departmentId: "",
  agreeToTerms: false,
};

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [step1, setStep1] = useState<RegisterStep1Values>(emptyStep1);

  const handleNext = (values: RegisterStep1Values) => {
    setStep1(values);
    setStep(2);
  };

  const handleSubmit = async (values: RegisterStep2Values) => {
    const { firstName, lastName } = splitName(step1.fullName);
    // The design omits a job-title field; the backend register DTO requires
    // one, so we default it (all self-signups become EMPLOYEE anyway).
    // workCategory has no backend home and is not sent.
    await registerUser({
      email: step1.email,
      password: values.password,
      firstName,
      lastName,
      phone: step1.phone,
      jobTitle: "Employee",
      departmentId: values.departmentId,
    });
    // Never auto-login — back to sign-in with the email prefilled and a
    // success banner (LoginForm reads these params).
    router.push(`/login?registered=1&email=${encodeURIComponent(step1.email)}`);
  };

  return (
    <AuthSplitLayout
      aside={<AuthAside />}
      topRight={
        <>
          <span className="hidden text-brand-muted sm:inline">Already have an account?</span>
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {step === 1 ? (
        <RegisterStep1Form defaultValues={step1} onNext={handleNext} />
      ) : (
        <RegisterStep2Form
          onSubmit={handleSubmit}
          onBack={() => setStep(1)}
          defaultDepartmentId={step1.departmentId}
        />
      )}
    </AuthSplitLayout>
  );
}
