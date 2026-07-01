import Link from "next/link";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/privacy" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            Privacy
          </Link>
          <Link href="/about" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Toggle theme"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:flex"
          >
            <Moon className="h-4 w-4" />
          </button>
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Sign in
          </Link>
          <Button
            render={<Link href="/register" />}
            nativeButton={false}
            className="h-9 bg-blue-600 hover:bg-blue-700"
          >
            Get started →
          </Button>
        </div>
      </div>
    </header>
  );
}
