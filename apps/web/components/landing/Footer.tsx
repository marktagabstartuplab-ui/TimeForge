import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-gray-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Logo />
        <p className="text-sm text-gray-400">© 2026 TimeForge. All rights reserved.</p>
        <nav className="flex items-center gap-6">
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900">
            Privacy
          </Link>
          <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-900">
            Terms
          </Link>
          <Link href="/support" className="text-sm text-gray-500 hover:text-gray-900">
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}
