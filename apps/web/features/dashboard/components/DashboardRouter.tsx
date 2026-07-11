"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { DashboardContent } from "./DashboardContent";
import { SystemOverviewContent } from "@/features/admin/components/SystemOverviewContent";
import { SupervisorDashboardContent } from "@/features/supervisor-dashboard/components/SupervisorDashboardContent";
import { HRDashboardContent } from "@/features/hr-dashboard/components/HRDashboardContent";

/** Admins land on System Overview, Supervisors on their team dashboard, HR on the HR Dashboard, everyone else sees their personal dashboard. */
export function DashboardRouter() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  const isSupervisor = user?.roles.includes("SUPERVISOR") ?? false;
  const isHr = user?.roles.includes("HR") ?? false;
  const isFinanceOnly = (user?.roles.includes("FINANCE") ?? false) && !isAdmin;

  // Finance has its own dedicated workspace/shell — this generic dashboard has no
  // Finance branch, so bounce them there if they land here by any means other than login.
  useEffect(() => {
    if (isFinanceOnly) router.replace("/finance/dashboard");
  }, [isFinanceOnly, router]);

  if (isFinanceOnly) return <LoadingScreen fullHeight={false} />;
  if (isAdmin) return <SystemOverviewContent />;
  if (isHr) return <HRDashboardContent />;
  if (isSupervisor) return <SupervisorDashboardContent />;
  return <DashboardContent />;
}
