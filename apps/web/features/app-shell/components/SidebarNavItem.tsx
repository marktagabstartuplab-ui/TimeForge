"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Timer,
  FileText,
  Users,
  Building2,
  CheckSquare,
  Wallet,
  BarChart3,
  ScrollText,
  CalendarDays,
  CalendarClock,
  Target,
  ClipboardCheck,
  Sparkles,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Bug,
  ClipboardList,
  Inbox,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "../store/sidebar.store";
import type { SidebarMenuItem } from "../api/navigation.service";

const ICON_MAP: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  "timer": Timer,
  "file-text": FileText,
  "users": Users,
  "building-2": Building2,
  "check-square": CheckSquare,
  "wallet": Wallet,
  "bar-chart-3": BarChart3,
  "scroll-text": ScrollText,
  "calendar-days": CalendarDays,
  "calendar-clock": CalendarClock,
  "target": Target,
  "clipboard-check": ClipboardCheck,
  "sparkles": Sparkles,
  "shield": Shield,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  "sliders": SlidersHorizontal,
  "bug": Bug,
  "clipboard-list": ClipboardList,
  // The nav catalog's `hr-grievances` entry asks for this; without the entry the
  // lookup returns undefined and HR Complaints Inbox renders label-only, out of
  // line with every sibling item.
  "inbox": Inbox,
};

interface SidebarNavItemProps {
  item: SidebarMenuItem;
  onNavigate?: () => void;
}

export const SidebarNavItem = memo(function SidebarNavItem({ item, onNavigate }: SidebarNavItemProps) {
  const pathname = usePathname();
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const setLastMenu = useSidebarStore((s) => s.setLastMenu);

  const active = pathname === item.route || pathname.startsWith(`${item.route}/`);
  // Falls back rather than rendering nothing: the server owns the catalog, so an
  // icon name can arrive that this map has never heard of. Rendering no glyph
  // makes the row inconsistent when expanded and — because the label is hidden
  // — completely blank when collapsed, which is how the missing "inbox" entry
  // went unnoticed.
  const Icon = ICON_MAP[item.icon] ?? Circle;

  const handleClick = () => {
    setLastMenu(item.id);
    onNavigate?.();
  };

  const linkContent = (
    <Link
      href={item.route}
      onClick={handleClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 border-l-4 px-6 text-sm font-medium transition-colors outline-none",
        active
          ? "border-brand-navy bg-brand-cyan/10 text-brand-muted"
          : "border-transparent text-brand-muted hover:bg-[#f6f3f4]",
        isCollapsed && "justify-center px-0 border-l-0",
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
            active ? "text-brand-navy" : "text-brand-muted",
          )}
          aria-hidden="true"
        />
      ) : null}

      {!isCollapsed ? (
        <>
          <span className="min-w-0 truncate">{item.label}</span>
          {item.badgeCount > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {item.badgeCount > 99 ? "99+" : item.badgeCount}
            </span>
          ) : null}
        </>
      ) : item.badgeCount > 0 ? (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={linkContent}
        />
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
          {item.badgeCount > 0 ? ` (${item.badgeCount})` : ""}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
});
