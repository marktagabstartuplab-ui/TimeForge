import type { Metadata } from "next";
import Link from "next/link";
import { AuthCenteredLayout } from "@/features/auth/components/AuthCenteredLayout";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { TrustRow } from "@/features/auth/components/TrustRow";

export const metadata: Metadata = { title: "Sign In | TimeForge" };

function LoginDecor() {
  return (
    <>
      <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[#48c8fe]/20 blur-3xl" />
      <div className="absolute right-0 top-1/4 h-96 w-96 rounded-full bg-[#7c95a6]/20 blur-3xl" />
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthCenteredLayout
      decor={<LoginDecor />}
      topCenter={
        <>
          <Link href="/#features" className="text-brand-muted hover:text-brand-navy">
            Features
          </Link>
          <Link href="/#pricing" className="text-brand-muted hover:text-brand-navy">
            Pricing
          </Link>
          <Link href="/#about" className="text-brand-muted hover:text-brand-navy">
            About
          </Link>
        </>
      }
      topRight={
        <>
          <span className="hidden text-brand-muted sm:inline">New to TimeForge?</span>
          <Link
            href="/register"
            className="rounded-[8px] bg-brand px-4 py-2 font-semibold text-white transition-colors hover:bg-[#1467d6]"
          >
            Get Started
          </Link>
        </>
      }
      belowCard={<TrustRow />}
    >
      <LoginForm />
    </AuthCenteredLayout>
  );
}
