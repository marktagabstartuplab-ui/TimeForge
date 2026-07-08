"use client";

import { useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/brand/Logo";
import { useSidebarStore } from "../store/sidebar.store";
import { SidebarNavSection } from "./SidebarNavSection";
import { SidebarBottomSection } from "./SidebarBottomSection";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import type { SidebarResponse, SidebarMenuItem } from "../api/navigation.service";

interface SidebarMobileDrawerProps {
  sidebarData: SidebarResponse | null;
  sections: { section: string; items: SidebarMenuItem[] }[];
  unreadNotifications: number;
}

/**
 * Mobile slide-in drawer for sidebar navigation (< lg breakpoint).
 * Features:
 * - Slide-in from left with framer-motion
 * - Backdrop overlay (click to close)
 * - Escape key to close
 * - Focus trap
 * - Always expanded (no collapsed mode)
 */
export function SidebarMobileDrawer({ sidebarData, sections, unreadNotifications }: SidebarMobileDrawerProps) {
  const isMobileOpen = useSidebarStore((s) => s.isMobileOpen);
  const closeMobile = useSidebarStore((s) => s.closeMobile);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile();
    },
    [closeMobile],
  );

  useEffect(() => {
    if (isMobileOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      // Focus the drawer on open
      requestAnimationFrame(() => drawerRef.current?.focus());
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isMobileOpen, handleKeyDown]);

  // Close drawer on navigation
  const handleNavigate = useCallback(() => {
    closeMobile();
  }, [closeMobile]);

  return (
    <AnimatePresence>
      {isMobileOpen ? (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeMobile}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            ref={drawerRef}
            className="fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] flex-col bg-white shadow-2xl lg:hidden"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-5">
              <Logo href="/dashboard" />
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-brand-surface hover:text-brand-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Org switcher */}
            <div className="px-3 py-3">
              <OrganizationSwitcher organization={sidebarData?.organization ?? null} />
            </div>

            {/* Scrollable nav */}
            <nav className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 py-2">
              {sections.map((group) => (
                <SidebarNavSection
                  key={group.section}
                  section={group.section}
                  items={group.items}
                  onNavigate={handleNavigate}
                />
              ))}
            </nav>

            {/* Bottom */}
            <div className="shrink-0 pb-4">
              <SidebarBottomSection unreadNotifications={unreadNotifications} />
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
