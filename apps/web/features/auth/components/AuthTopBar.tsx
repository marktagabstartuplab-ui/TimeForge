import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

interface AuthTopBarProps {
  /** Optional center nav. */
  center?: React.ReactNode;
  /** Optional right-side slot; defaults to the "Support" button per the design. */
  right?: React.ReactNode;
}

export function AuthTopBar({ center, right }: AuthTopBarProps) {
  return (
    <header className="w-full border-b border-[#c3c6d2]/40 bg-[#faf9f9]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        {center ? <nav className="hidden items-center gap-8 text-sm md:flex">{center}</nav> : null}
        <div className="flex items-center gap-4 text-sm">
          {right ?? (
            <Link
              href="/support"
              className="flex h-9 items-center rounded-md border border-[#c3c6d2]/80 bg-white px-4 font-semibold text-brand-ink transition-colors hover:bg-[#f6f3f4]"
            >
              Support
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
