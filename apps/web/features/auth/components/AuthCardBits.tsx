import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export function LockBadge() {
  return (
    <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e6eef1] text-brand-navy">
      <LockKeyhole className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Sign In
    </Link>
  );
}
