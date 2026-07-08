"use client";

import { useRouter } from "next/navigation";
import { Bell, Settings, LogOut } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useNotificationCenterStore } from "@/features/notifications/store/notification-center.store";
import { logout } from "@/features/auth/api/auth.service";
import { useSidebarStore } from "../store/sidebar.store";

interface SidebarBottomSectionProps {
  unreadNotifications: number;
}

export function SidebarBottomSection({ unreadNotifications }: SidebarBottomSectionProps) {
  const router = useRouter();
  const { clearSession } = useAuth();
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const openNotifications = useNotificationCenterStore((s) => s.open);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const items = [
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      badge: unreadNotifications,
      onClick: openNotifications,
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      href: "/settings",
    },
    {
      id: "sign-out",
      label: "Sign Out",
      icon: LogOut,
      onClick: handleLogout,
      destructive: true,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-0.5 border-t border-[#c3c6d2] pt-3">
      {items.map((item) => {
        const Icon = item.icon;
        const isDestructive = "destructive" in item && item.destructive;

        const content = (
          <div
            className={cn(
              "group flex h-10 items-center gap-3 border-l-4 px-6 text-sm font-medium transition-colors outline-none",
              isDestructive
                ? "border-transparent text-brand-muted hover:bg-red-50 hover:text-red-600"
                : "border-transparent text-brand-muted hover:bg-[#f6f3f4]",
              isCollapsed && "justify-center px-0 border-l-0",
            )}
          >
            <div className="relative">
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                  isDestructive
                    ? "group-hover:text-red-600"
                    : "text-brand-muted group-hover:text-brand-ink",
                )}
                aria-hidden="true"
              />
              {/* Badge dot for collapsed mode */}
              {"badge" in item && item.badge > 0 && isCollapsed ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                  aria-hidden="true"
                />
              ) : null}
            </div>

            {!isCollapsed ? (
              <>
                <span className="min-w-0 truncate">{item.label}</span>
                {"badge" in item && item.badge > 0 ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        );

        const element = "href" in item ? (
          <a key={item.id} href={item.href} className="block">
            {content}
          </a>
        ) : (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            aria-label={item.label}
            className="w-full text-left"
          >
            {content}
          </button>
        );

        if (isCollapsed) {
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger
                render={element}
              />
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
                {"badge" in item && item.badge > 0 ? ` (${item.badge})` : ""}
              </TooltipContent>
            </Tooltip>
          );
        }

        return element;
      })}
    </div>
  );
}
