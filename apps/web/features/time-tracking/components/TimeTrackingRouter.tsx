"use client";

import { useAuth } from "@/providers/auth-provider";
import { TimeTrackingContent } from "./TimeTrackingContent";
import { ScrumManagementContent } from "@/features/scrum-management/components/ScrumManagementContent";

/** Supervisors and Admins land on the Daily Scrum Management dashboard; everyone else runs their own session. */
export function TimeTrackingRouter() {
  const { user } = useAuth();
  const isManager = user ? user.roles.includes("SUPERVISOR") || user.roles.includes("ADMIN") : false;

  return isManager ? <ScrumManagementContent /> : <TimeTrackingContent />;
}
