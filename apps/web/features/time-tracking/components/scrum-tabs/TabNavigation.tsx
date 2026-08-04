"use client";

import { CheckIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScrumTabId = "plan" | "work" | "review" | "submit";

export type TabStatus = "done" | "current" | "pending" | "locked";

export interface ScrumTabDescriptor {
  id: ScrumTabId;
  /** "1. PLAN" — kept short so four tabs fit a 375px viewport without truncating. */
  shortLabel: string;
  /** Full name, used for the accessible label and the panel heading. */
  label: string;
  status: TabStatus;
}

const STATUS_LABEL: Record<TabStatus, string> = {
  done: "Done",
  current: "In progress",
  pending: "Pending",
  locked: "Locked",
};

interface TabNavigationProps {
  tabs: ScrumTabDescriptor[];
  active: ScrumTabId;
  onSelect: (id: ScrumTabId) => void;
}

/**
 * Four-step tab bar for the Daily Scrum workflow. Locked steps stay clickable —
 * the badge tells the employee what is outstanding without trapping them on a
 * step they cannot finish yet.
 */
export function TabNavigation({ tabs, active, onSelect }: TabNavigationProps) {
  return (
    <div
      role="tablist"
      aria-label="Daily Scrum steps"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`scrum-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`scrum-panel-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex min-h-[56px] flex-col items-start justify-center gap-0.5 rounded-[10px] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              selected
                ? "border-brand bg-brand text-white"
                : "border-[#c3c6d2]/60 bg-white text-brand-navy hover:bg-[#f6f3f4]",
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-bold leading-tight">
              {tab.status === "done" ? (
                <CheckIcon
                  className={cn("h-4 w-4 shrink-0", selected ? "text-white" : "text-[#16a34a]")}
                  aria-hidden="true"
                />
              ) : tab.status === "locked" ? (
                <LockIcon
                  className={cn("h-4 w-4 shrink-0", selected ? "text-white/80" : "text-brand-muted")}
                  aria-hidden="true"
                />
              ) : null}
              {tab.shortLabel}
            </span>
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.5px]",
                selected ? "text-white/75" : "text-brand-muted",
              )}
            >
              {STATUS_LABEL[tab.status]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
