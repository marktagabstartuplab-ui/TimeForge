import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

interface AuthTopBarProps {
  /** Optional center nav (used on the login screen). */
  center?: React.ReactNode;
  /** Optional right-side slot; defaults to a "Help Center" link per the design. */
  right?: React.ReactNode;
}

export function AuthTopBar({ center, right }: AuthTopBarProps) {
  return (
    <header className="w-full border-b border-[#c3c6d2]/60 bg-[#faf9f9]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        {center ? <nav className="hidden items-center gap-8 text-sm md:flex">{center}</nav> : null}
        <div className="flex items-center gap-4 text-sm">
          {right ?? (
            <Link href="/support" className="font-medium text-brand-navy hover:text-brand">
              Help Center
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
