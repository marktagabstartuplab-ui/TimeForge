"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "../store/sidebar.store";
import { SidebarNavItem } from "./SidebarNavItem";
import type { SidebarMenuItem } from "../api/navigation.service";

const SECTION_LABELS: Record<string, string> = {
  WORKSPACE: "Workspace",
  MANAGEMENT: "Management",
  FINANCE: "Finance",
  FINANCE_REPORTS: "Finance & Reports",
  SYSTEM: "System",
};

interface SidebarNavSectionProps {
  section: string;
  items: SidebarMenuItem[];
  onNavigate?: () => void;
}

export function SidebarNavSection({ section, items, onNavigate }: SidebarNavSectionProps) {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const label = SECTION_LABELS[section] ?? section;

  const memoizedItems = useMemo(() => items, [items]);

  if (memoizedItems.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Section label — uppercase tracking-wide muted text matching screenshot */}
      {!isCollapsed ? (
        <p
          className={cn(
            "mb-2 px-6 text-[10px] font-semibold uppercase tracking-[1.5px] text-brand-muted/70",
            "select-none",
          )}
        >
          {label}
        </p>
      ) : (
        <div className="mx-auto my-1 h-px w-6 bg-brand-muted/20" aria-hidden="true" />
      )}

      {memoizedItems.map((item) => (
        <SidebarNavItem key={item.id} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
