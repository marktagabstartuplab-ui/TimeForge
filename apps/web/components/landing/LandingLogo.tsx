import Link from "next/link";
import { Clock } from "lucide-react";

// Distinct, simpler mark used only on the marketing landing page — the
// StartupLab lockup (components/brand/Logo.tsx) is reserved for the app
// shell and the sign-in screen.
export function LandingLogo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
        <Clock className="h-4.5 w-4.5 text-white" strokeWidth={2.25} />
      </span>
      <span className="text-lg font-bold text-brand-ink">TimeForge</span>
    </Link>
  );
}
