"use client";

import { useAuth } from "@/providers/auth-provider";
import { DashboardContent } from "./DashboardContent";
import { SystemOverviewContent } from "@/features/admin/components/SystemOverviewContent";
import { SupervisorDashboardContent } from "@/features/supervisor-dashboard/components/SupervisorDashboardContent";
import { HRDashboardContent } from "@/features/hr-dashboard/components/HRDashboardContent";

/** Admins land on System Overview, Supervisors on their team dashboard, HR on the HR Dashboard, everyone else sees their personal dashboard. */
export function DashboardRouter() {
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  const isSupervisor = user?.roles.includes("SUPERVISOR") ?? false;
  const isHr = user?.roles.includes("HR") ?? false;

  if (isAdmin) return <SystemOverviewContent />;
  if (isHr) return <HRDashboardContent />;
  if (isSupervisor) return <SupervisorDashboardContent />;
  return <DashboardContent />;
}
