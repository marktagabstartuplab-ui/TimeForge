"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { useAuth } from "@/providers/auth-provider";
import { EmployeeStatsCards } from "./EmployeeStatsCards";
import { EmployeeTable } from "./EmployeeTable";
import { PermissionMatrixCard } from "./PermissionMatrixCard";
import { AuditTimelineCard } from "./AuditTimelineCard";
import { InviteEmployeeModal } from "./InviteEmployeeModal";

export function EmployeeManagementContent() {
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  const [toast, setToast] = useState<ToastState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">User Management &amp; Roles</h1>
          <p className="text-sm text-brand-muted">Manage your workforce, define access levels, and audit system permissions.</p>
        </div>
        {isAdmin ? (
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" />
            Invite Employee
          </Button>
        ) : null}
      </div>

      <EmployeeStatsCards isAdmin={isAdmin} />
      <EmployeeTable isAdmin={isAdmin} onToast={setToast} />

      {isAdmin ? (
        <div className="flex flex-col gap-6 lg:flex-row">
          <PermissionMatrixCard />
          <AuditTimelineCard />
        </div>
      ) : null}

      <InviteEmployeeModal open={inviteOpen} onOpenChange={setInviteOpen} onToast={setToast} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
