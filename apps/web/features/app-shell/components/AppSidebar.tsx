"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Clock,
  FileText,
  Wallet,
  BarChart3,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/time-tracking", label: "Time Tracking", icon: Clock },
  { href: "/timesheets", label: "Time Sheet", icon: FileText },
  { href: "/payslips", label: "Payslips", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile/tablet backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[260px] shrink-0 flex-col border-r border-[#c3c6d2] bg-white py-6 transition-transform duration-200",
          "lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between px-6 pb-8">
          <div>
            <Logo variant="stacked" />
            <p className="mt-1 text-[10px] font-normal uppercase tracking-[1px] text-brand-muted/70">
              Workforce Management
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-1 text-brand-muted hover:bg-[#f6f3f4] lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 border-l-4 px-6 text-sm font-medium transition-colors",
                  active
                    ? "border-brand-navy bg-brand-cyan/10 text-brand-muted"
                    : "border-transparent text-brand-muted hover:bg-[#f6f3f4]",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 px-6">
          <div className="flex flex-col gap-2 rounded-[12px] border border-brand-navy/10 bg-brand-navy/5 p-4">
            <p className="text-xs font-semibold text-brand">Need help?</p>
            <Link
              href="/support"
              className="flex items-center justify-center rounded-[8px] bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-[#1467d6]"
            >
              Contact Support
            </Link>
          </div>
          <Link
            href="/settings"
            className="flex h-10 items-center gap-3 px-2 text-sm font-medium text-brand-muted hover:text-brand-navy"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
            Settings
          </Link>
        </div>
      </aside>
    </>
  );
}
