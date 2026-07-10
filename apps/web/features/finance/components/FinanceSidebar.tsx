"use client";

import { useMemo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/features/app-shell/store/sidebar.store";
import { SidebarHeader } from "@/features/app-shell/components/SidebarHeader";
import { SidebarNavSection } from "@/features/app-shell/components/SidebarNavSection";
import { SidebarBottomSection } from "@/features/app-shell/components/SidebarBottomSection";
import { SidebarMobileDrawer } from "@/features/app-shell/components/SidebarMobileDrawer";
import { getSidebarNavigation, type SidebarMenuItem, type SidebarOrganization } from "@/features/app-shell/api/navigation.service";

const FINANCE_NAV_ITEMS: SidebarMenuItem[] = [
  { id: "finance-dashboard", label: "Dashboard", icon: "layout-grid", route: "/finance/dashboard", section: "FINANCE", badgeCount: 0, permission: "payroll:read", visible: true },
  { id: "finance-payroll", label: "Payroll Processing", icon: "wallet", route: "/finance/payroll-processing", section: "FINANCE", badgeCount: 0, permission: "payroll_period:read", visible: true },
  { id: "finance-reports", label: "Financial Reports", icon: "bar-chart-3", route: "/finance/reports", section: "FINANCE", badgeCount: 0, permission: "org:read_dashboard", visible: true },
  { id: "finance-ai", label: "AI Insights", icon: "sparkles", route: "/finance/ai-insights", section: "FINANCE", badgeCount: 0, permission: "dashboard:read_org", visible: true },
];

export function FinanceSidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const [org, setOrg] = useState<SidebarOrganization | null>(null);

  useEffect(() => {
    getSidebarNavigation()
      .then((data) => setOrg(data.organization))
      .catch(() => setOrg({ id: "", name: "Finance", logoUrl: null }));
  }, []);

  const sections = useMemo(() => [{ section: "FINANCE", items: FINANCE_NAV_ITEMS }], []);
  const orgData = org ?? { id: "", name: "Finance", logoUrl: null };

  return (
    <>
      <aside
        className={cn(
          "hidden lg:flex h-screen shrink-0 flex-col border-r border-[#c3c6d2] bg-white py-6 transition-[width] duration-300 ease-in-out",
          isCollapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <div className="shrink-0">
          <SidebarHeader organization={orgData} homeHref="/finance/dashboard" />
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden py-4 mt-4">
          {sections.map((group) => (
            <SidebarNavSection
              key={group.section}
              section={group.section}
              items={group.items}
            />
          ))}
        </nav>

        <div className="shrink-0">
          <SidebarBottomSection unreadNotifications={0} />
        </div>
      </aside>

      <SidebarMobileDrawer
        sidebarData={{ workspace: { name: "TimeForge" }, organization: orgData, user: { id: "", firstName: "", lastName: "", roles: [] }, menu: FINANCE_NAV_ITEMS }}
        sections={sections}
        unreadNotifications={0}
        homeHref="/finance/dashboard"
      />
    </>
  );
}
