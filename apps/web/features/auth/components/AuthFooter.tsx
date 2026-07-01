import Link from "next/link";

const links = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Help Center", href: "/support" },
  { label: "Contact Support", href: "/support" },
];

export function AuthFooter() {
  return (
    <footer className="w-full border-t border-[#c3c6d2]/60 bg-[#faf9f9]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm sm:flex-row sm:px-6 lg:px-8">
        <span className="font-bold text-brand-navy">TimeForge</span>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="text-brand-muted hover:text-brand-navy">
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="text-brand-muted">© 2024 TimeForge. All rights reserved.</span>
      </div>
    </footer>
  );
}
