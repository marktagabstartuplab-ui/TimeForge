import Link from "next/link";
import { Moon } from "lucide-react";
import { LandingLogo } from "./LandingLogo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <LandingLogo />

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/privacy" className="text-sm text-brand-muted transition-colors hover:text-brand-ink">
            Privacy
          </Link>
          <Link href="/about" className="text-sm text-brand-muted transition-colors hover:text-brand-ink">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Toggle theme"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-brand-muted/70 transition-colors hover:bg-gray-100 hover:text-brand-muted sm:flex"
          >
            <Moon className="h-4 w-4" />
          </button>
          <Link
            href="/login"
            className="text-sm font-semibold text-brand-ink transition-colors hover:text-brand"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="flex h-9 items-center rounded-[8px] bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1467d6]"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
