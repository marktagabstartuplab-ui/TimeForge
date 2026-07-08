"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  X,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  Settings,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "../store/sidebar.store";
import { SidebarNavSection } from "./SidebarNavSection";
import type { SidebarMenuItem } from "../api/navigation.service";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
  section: "WORKSPACE" | "MANAGEMENT" | "FINANCE_REPORTS" | "FINANCE" | "SYSTEM";
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: "layout-grid", section: "WORKSPACE" },
  { id: "time-tracking", href: "/time-tracking", label: "Daily Scrum", icon: "timer", section: "WORKSPACE" },
  { id: "timesheets", href: "/timesheets", label: "Time Sheet", icon: "file-text", section: "WORKSPACE" },
  { id: "payslips", href: "/payslips", label: "Payslips", icon: "wallet", section: "FINANCE_REPORTS" },
  { id: "reports", href: "/reports", label: "Reports", icon: "bar-chart-3", section: "FINANCE_REPORTS" },
  { id: "performance", href: "/performance", label: "Performance Report", icon: "bar-chart-3", section: "FINANCE_REPORTS" },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "system-logs", href: "/admin/audit-logs", label: "System Logs", icon: "scroll-text", section: "SYSTEM" },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

const SECTION_ORDER = ["WORKSPACE", "MANAGEMENT", "FINANCE_REPORTS", "FINANCE", "SYSTEM"] as const;

function groupBySection(items: SidebarMenuItem[]): { section: string; items: SidebarMenuItem[] }[] {
  const map = new Map<string, SidebarMenuItem[]>();
  for (const item of items) {
    const list = map.get(item.section);
    if (list) list.push(item);
    else map.set(item.section, [item]);
  }
  return SECTION_ORDER
    .filter((s) => map.has(s))
    .map((s) => ({ section: s, items: map.get(s)! }));
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const { user } = useAuth();
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggleCollapse = useSidebarStore((s) => s.toggleCollapse);

  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  const navItems = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  const menuItems = useMemo<SidebarMenuItem[]>(() => {
    return navItems.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      route: item.href,
      section: item.section,
      badgeCount: 0,
      permission: "",
      visible: true,
    }));
  }, [navItems]);

  const sections = useMemo(() => groupBySection(menuItems), [menuItems]);

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
          "fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col border-r border-[#c3c6d2] bg-white py-6 transition-[width,transform] duration-300 ease-in-out",
          "lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <div
          className={cn(
            "flex items-start pb-8 px-6",
            isCollapsed ? "justify-center" : "justify-between",
          )}
        >
          {!isCollapsed ? (
            <div>
              <Logo href="/dashboard" />
              <p className="mt-1 text-[10px] font-normal uppercase tracking-[1px] text-brand-muted/70">
                Workforce Management
              </p>
            </div>
          ) : (
            <Logo href="/dashboard" className="[&_span:last-child]:hidden shrink-0" />
          )}

          <div className="flex items-center gap-1">
            {/* Close button for mobile */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="rounded-md p-1 text-brand-muted hover:bg-[#f6f3f4] lg:hidden"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Collapse toggle — always visible on desktop */}
            {!isCollapsed ? (
              <button
                type="button"
                onClick={toggleCollapse}
                aria-label="Collapse sidebar"
                className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-brand-muted/60 transition-colors hover:bg-brand-surface hover:text-brand-muted"
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={toggleCollapse}
                      aria-label="Expand sidebar"
                      className="hidden lg:flex mt-2 h-7 w-7 items-center justify-center rounded-md text-brand-muted/60 transition-colors hover:bg-brand-surface hover:text-brand-muted"
                    >
                      <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                    </button>
                  }
                />
                <TooltipContent side="right" sideOffset={8}>
                  Expand sidebar
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden py-4">
          {sections.map((group) => (
            <SidebarNavSection
              key={group.section}
              section={group.section}
              items={group.items}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="mt-auto">
          {!isCollapsed ? (
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
          ) : (
            <div className="flex flex-col items-center gap-4 px-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/support"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                    >
                      <HelpCircle className="h-5 w-5" />
                    </Link>
                  }
                />
                <TooltipContent side="right" sideOffset={8}>
                  Contact Support
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/settings"
                      className="flex h-10 w-10 items-center justify-center rounded-md text-brand-muted hover:text-brand-navy transition-colors"
                    >
                      <Settings className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  }
                />
                <TooltipContent side="right" sideOffset={8}>
                  Settings
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

