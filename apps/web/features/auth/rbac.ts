"use client";

import { useAuth } from "@/providers/auth-provider";

/**
 * Client-side mirror of the backend role→permission matrix
 * (packages/shared/src/permissions.ts) for the permissions the UI gates on.
 * The backend remains the source of truth — this only hides actions the
 * logged-in user cannot perform (RBAC UX, not security).
 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  ADMIN: ["*"],
  EMPLOYEE: [
    "time_entry:create", "time_entry:read", "time_entry:update", "time_entry:delete",
    "timesheet:create", "timesheet:read", "timesheet:update", "timesheet:submit",
    "scrum:create", "scrum:read", "scrum:update",
    "kpi_progress:read", "kpi_template:read",
    "payroll:read_self",
    "dashboard:read_self",
    "project:read", "client:read", "work_category:read", "department:read", "team:read",
    "leave_request:create", "leave_request:read", "leave_request:cancel", "leave_balance:read",
  ],
  SUPERVISOR: [
    "user:read",
    "time_entry:create", "time_entry:read", "time_entry:update", "time_entry:delete", "time_entry:read_team",
    "timesheet:create", "timesheet:read", "timesheet:update", "timesheet:submit", "timesheet:read_team",
    "scrum:create", "scrum:read", "scrum:update", "scrum:read_team",
    "kpi_progress:read", "kpi_progress:read_team", "kpi_template:read",
    "approval:read_team", "approval:decide", "approval:remark",
    "payroll:read_status_team",
    "dashboard:read_self", "dashboard:read_team",
    "project:read", "client:read", "work_category:read", "department:read", "team:read",
    "schedule:read_team",
    "ai:trigger_team",
    "leave_request:create", "leave_request:read", "leave_request:cancel", "leave_balance:read",
    "leave_request:read_team", "leave_request:decide",
  ],
  HR: [
    "user:read",
    "timesheet:read", "timesheet:read_org",
    "kpi_progress:read_org", "kpi:read_org", "kpi_template:read",
    "attendance:read_org",
    "payroll_period:read",
    "dashboard:read_self", "dashboard:read_org",
    "project:read", "client:read", "work_category:read", "department:read", "team:read",
    "org:read_dashboard",
    "org:read",
    "leave_request:read_org", "leave_request:decide", "leave_balance:read_org",
  ],
  FINANCE: [
    "user:read",
    "timesheet:read", "timesheet:read_org",
    "kpi_progress:read_org", "kpi:read_org",
    "payroll:read", "payroll_period:read", "payroll_period:create", "payroll_period:update",
    "payroll:generate", "payroll:export", "payroll_rate:read", "payroll_rate:update",
    "dashboard:read_self", "dashboard:read_org",
    "project:read", "client:read", "work_category:read", "department:read", "team:read",
    "org:read",
  ],
};

export function hasPermission(roles: string[] | undefined, permission: string): boolean {
  if (!roles?.length) return false;
  return roles.some((role) => {
    const perms = ROLE_PERMISSIONS[role];
    return perms ? perms.includes("*") || perms.includes(permission) : false;
  });
}

/** True when the logged-in user's roles grant the given `resource:action` permission. */
export function useCan(permission: string): boolean {
  const { user } = useAuth();
  return hasPermission(user?.roles, permission);
}
