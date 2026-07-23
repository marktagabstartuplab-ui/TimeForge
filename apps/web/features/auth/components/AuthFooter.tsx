"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";
import { TermsModal } from "./TermsModal";
import { SupportModal } from "./SupportModal";
import { BRAND_NAME } from "@/lib/constants";

function LegalModals() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const modal = searchParams?.get("modal");

  const close = () => {
    if (!searchParams) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("modal");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <PrivacyPolicyModal open={modal === "privacy"} onOpenChange={(open) => !open && close()} />
      <TermsModal open={modal === "terms"} onOpenChange={(open) => !open && close()} />
      <SupportModal open={modal === "support"} onOpenChange={(open) => !open && close()} />
    </>
  );
}

export function AuthFooter() {
  return (
    <footer className="w-full border-t border-[#c3c6d2]/40 bg-[#faf9f9]">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-6 text-sm sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <div>
          <p className="font-bold text-brand-navy">{BRAND_NAME}</p>
          <p className="mt-1 text-brand-muted">© 2026 {BRAND_NAME}. All rights reserved.</p>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="?modal=privacy" className="text-brand-muted hover:text-brand-navy">
            Privacy Policy
          </Link>
          <Link href="?modal=terms" className="text-brand-muted hover:text-brand-navy">
            Terms of Service
          </Link>
        </nav>
      </div>

      <Suspense fallback={null}>
        <LegalModals />
      </Suspense>
    </footer>
  );
}
