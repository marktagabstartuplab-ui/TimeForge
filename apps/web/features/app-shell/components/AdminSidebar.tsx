"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "../store/sidebar.store";
import { getSidebarNavigation } from "../api/navigation.service";
import type { SidebarMenuItem } from "../api/navigation.service";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNavSection } from "./SidebarNavSection";
import { SidebarBottomSection } from "./SidebarBottomSection";
import { SidebarMobileDrawer } from "./SidebarMobileDrawer";

/** The canonical section ordering. */
const SECTION_ORDER = ["WORKSPACE", "MANAGEMENT", "FINANCE_REPORTS", "FINANCE", "SYSTEM"] as const;

/**
 * Groups menu items by section, maintaining the canonical order.
 */
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

/**
 * AdminSidebar — enterprise navigation sidebar for TimeForge.
 *
 * Features:
 * - RBAC-driven menu (backend filters by permission)
 * - Collapsible with localStorage persistence
 * - 30-second badge refresh polling
 * - Mobile drawer for < lg breakpoints
 * - Keyboard accessible with tooltips
 */
export function AdminSidebar() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);

  const { data: sidebarData } = useQuery({
    queryKey: ["navigation", "sidebar"],
    queryFn: getSidebarNavigation,
    refetchInterval: 30_000, // 30s badge refresh
    staleTime: 10_000,
  });

  const sections = useMemo(
    () => groupBySection(sidebarData?.menu ?? []),
    [sidebarData?.menu],
  );

  const unreadNotifications = useMemo(() => {
    if (!sidebarData) return 0;
    // Find unread count from the notifications badge or compute from menu items
    const notifItem = sidebarData.menu.find((m) => m.id === "notifications");
    return notifItem?.badgeCount ?? 0;
  }, [sidebarData]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex h-screen shrink-0 flex-col border-r border-[#c3c6d2] bg-white py-6 transition-[width] duration-300 ease-in-out",
          isCollapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        {/* Header: Logo + Org Switcher */}
        <div className="shrink-0">
          <SidebarHeader organization={sidebarData?.organization ?? null} />
        </div>

        {/* Scrollable nav area */}
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden py-4 mt-4">
          {sections.map((group) => (
            <SidebarNavSection
              key={group.section}
              section={group.section}
              items={group.items}
            />
          ))}
        </nav>

        {/* Bottom: Notifications + Settings + Sign Out */}
        <div className="shrink-0">
          <SidebarBottomSection unreadNotifications={unreadNotifications} />
        </div>
      </aside>

      {/* Mobile drawer (< lg) */}
      <SidebarMobileDrawer
        sidebarData={sidebarData ?? null}
        sections={sections}
        unreadNotifications={unreadNotifications}
      />
    </>
  );
}
