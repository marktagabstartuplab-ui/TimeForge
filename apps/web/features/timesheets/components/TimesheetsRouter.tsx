"use client";

import { useAuth } from "@/providers/auth-provider";
import { TimesheetsContent } from "./TimesheetsContent";
import { TimesheetOversightContent } from "@/features/timesheet-oversight/components/TimesheetOversightContent";

/** Supervisors and Admins land on Timesheet Oversight; everyone else manages their own timesheets. */
export function TimesheetsRouter() {
  const { user } = useAuth();
  const isManager = user ? user.roles.includes("SUPERVISOR") || user.roles.includes("ADMIN") : false;

  return isManager ? <TimesheetOversightContent /> : <TimesheetsContent />;
}
