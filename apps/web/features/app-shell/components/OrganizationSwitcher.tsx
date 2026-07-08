"use client";

import { Building2, ChevronsUpDown } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "../store/sidebar.store";
import type { SidebarOrganization } from "../api/navigation.service";

interface OrganizationSwitcherProps {
  organization: SidebarOrganization | null;
}

/**
 * Displays the current organization. Future-proofed with a dropdown wrapper
 * for multi-org switching (currently single-org per user).
 */
export function OrganizationSwitcher({ organization }: OrganizationSwitcherProps) {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);

  const orgName = organization?.name ?? "Organization";

  const content = (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-[#f6f3f4]",
        isCollapsed && "justify-center px-0",
      )}
    >
      {/* Org avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
        {organization?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={organization.logoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
        ) : (
          <Building2 className="h-4 w-4 text-brand" aria-hidden="true" />
        )}
      </div>

      {!isCollapsed ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-brand-ink">{orgName}</p>
            <p className="truncate text-[11px] text-brand-muted">Workspace</p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-brand-muted/50" aria-hidden="true" />
        </>
      ) : null}
    </div>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<button type="button" aria-label={orgName} className="w-full">{content}</button>} />
        <TooltipContent side="right" sideOffset={8}>
          {orgName}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button type="button" aria-label={`Organization: ${orgName}`} className="w-full text-left">
      {content}
    </button>
  );
}
