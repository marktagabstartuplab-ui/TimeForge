"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, MonitorSmartphone } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { ApiError } from "@/lib/api/client";
import { listSessions, logoutOtherDevices, type Me } from "../api/account.service";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import type { ToastState } from "@/components/shared/Toast";

/** Best-effort browser/OS label from a raw User-Agent string. */
function describeDevice(device: string | null): string {
  if (!device) return "Unknown device";
  const browser = /Edg\//.test(device)
    ? "Edge"
    : /Chrome\//.test(device)
      ? "Chrome"
      : /Firefox\//.test(device)
        ? "Firefox"
        : /Safari\//.test(device)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(device)
    ? "Windows"
    : /Mac OS/.test(device)
      ? "macOS"
      : /Linux/.test(device)
        ? "Linux"
        : /Android/.test(device)
          ? "Android"
          : /iPhone|iPad/.test(device)
            ? "iOS"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SecuritySection({ me, onToast }: { me: Me; onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);

  const sessionsQuery = useQuery({ queryKey: ["account", "sessions"], queryFn: listSessions });

  const logoutOthers = useMutation({
    mutationFn: logoutOtherDevices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account", "sessions"] });
      setLogoutOthersOpen(false);
      onToast({ message: "Other devices have been signed out.", tone: "success" });
    },
    onError: (err) => {
      onToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" });
      setLogoutOthersOpen(false);
    },
  });

  return (
    <SectionCard title="Account Security">
      <div className="flex items-center justify-between gap-4 border-b border-[#c3c6d2]/50 pb-4">
        <div>
          <p className="text-sm font-semibold text-brand-navy">Last Login</p>
          <p className="text-xs text-brand-muted">
            {me.lastLoginAt ? formatDateTime(me.lastLoginAt) : "This is your first login"}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setPasswordDialogOpen(true)}>
          <KeyRound aria-hidden="true" />
          Change Password
        </Button>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-brand-navy">Active Sessions</p>
        {sessionsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {sessionsQuery.data.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-[#c3c6d2]/50 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <MonitorSmartphone className="h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-brand-ink">
                      {describeDevice(session.device)}
                      {session.current ? (
                        <span className="ml-2 rounded-full bg-brand-cyan/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-brand-muted">
                      {session.ip ?? "Unknown IP"} · Signed in {formatDateTime(session.createdAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-muted">No active sessions.</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="destructive" size="sm" onClick={() => setLogoutOthersOpen(true)}>
          <LogOut aria-hidden="true" />
          Logout Other Devices
        </Button>
      </div>

      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} onToast={onToast} />

      <ConfirmationDialog
        open={logoutOthersOpen}
        onOpenChange={setLogoutOthersOpen}
        title="Logout other devices?"
        description="This will end every other active session. This device will remain signed in."
        confirmLabel={logoutOthers.isPending ? "Logging out…" : "Logout Other Devices"}
        destructive
        pending={logoutOthers.isPending}
        onConfirm={() => logoutOthers.mutate()}
      />
    </SectionCard>
  );
}
