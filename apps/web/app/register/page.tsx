import type { Metadata } from "next";
import { RegisterWizard } from "@/features/auth/components/register/RegisterWizard";

export const metadata: Metadata = { title: "Create Account | HeroTime" };

export default function RegisterPage() {
  return <RegisterWizard />;
}
