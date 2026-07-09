"use client";

import { Logo } from "@/components/brand/Logo";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "../store/sidebar.store";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import type { SidebarOrganization } from "../api/navigation.service";

interface SidebarHeaderProps {
  organization: SidebarOrganization | null;
  /** Where the logo links — defaults to the generic dashboard; scoped shells (e.g. Finance) should pass their own home route. */
  homeHref?: string;
}

export function SidebarHeader({ organization, homeHref = "/dashboard" }: SidebarHeaderProps) {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggleCollapse = useSidebarStore((s) => s.toggleCollapse);

  return (
    <div className="flex flex-col gap-3 px-6 pb-2">
      {/* Logo + collapse toggle row */}
      <div
        className={cn(
          "flex items-center",
          isCollapsed ? "justify-center" : "justify-between",
        )}
      >
        {!isCollapsed ? (
          <div>
            <Logo href={homeHref} />
            <p className="mt-1 text-[10px] font-normal uppercase tracking-[1px] text-brand-muted/70">
              Workforce Management
            </p>
          </div>
        ) : (
          <Logo href={homeHref} className="[&_span:last-child]:hidden" />
        )}

        {/* Collapse toggle — always visible on desktop */}
        {!isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-brand-muted/60 transition-colors hover:bg-brand-surface hover:text-brand-muted"
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
                  className="mt-2 flex h-7 w-7 items-center justify-center rounded-md text-brand-muted/60 transition-colors hover:bg-brand-surface hover:text-brand-muted"
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

      {/* Organization Switcher */}
      <OrganizationSwitcher organization={organization} />
    </div>
  );
}
