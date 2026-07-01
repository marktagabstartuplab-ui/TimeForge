import { Role } from './enums';

/**
 * Permission catalog (`resource:action`) — Phase 4 §0.2.
 * Used by the RBAC guard and the seeder. ADMIN is granted the `*` wildcard.
 */
export const PERMISSIONS = {
  // users
  USER_READ: 'user:read',
  USER_READ_SELF: 'user:read_self',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DEACTIVATE: 'user:deactivate',
  USER_ASSIGN_ROLE: 'user:assign_role',
  // rbac
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  PERMISSION_READ: 'permission:read',
  // organization
  ORG_READ: 'org:read',
  ORG_UPDATE: 'org:update',
  ORG_SETTINGS_READ: 'org_settings:read',
  ORG_SETTINGS_UPDATE: 'org_settings:update',
  HOLIDAY_READ: 'holiday:read',
  HOLIDAY_WRITE: 'holiday:write',
  // departments
  DEPARTMENT_READ: 'department:read',
  DEPARTMENT_CREATE: 'department:create',
  DEPARTMENT_UPDATE: 'department:update',
  DEPARTMENT_DELETE: 'department:delete',
  // teams
  TEAM_READ: 'team:read',
  TEAM_CREATE: 'team:create',
  TEAM_UPDATE: 'team:update',
  TEAM_DELETE: 'team:delete',
  // projects
  PROJECT_READ: 'project:read',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  // clients
  CLIENT_READ: 'client:read',
  CLIENT_CREATE: 'client:create',
  CLIENT_UPDATE: 'client:update',
  CLIENT_DELETE: 'client:delete',
  // work categories
  WORK_CATEGORY_READ: 'work_category:read',
  WORK_CATEGORY_CREATE: 'work_category:create',
  WORK_CATEGORY_UPDATE: 'work_category:update',
  WORK_CATEGORY_DELETE: 'work_category:delete',
  // time tracking
  TIME_ENTRY_CREATE: 'time_entry:create',
  TIME_ENTRY_READ: 'time_entry:read',
  TIME_ENTRY_UPDATE: 'time_entry:update',
  TIME_ENTRY_DELETE: 'time_entry:delete',
  TIME_ENTRY_READ_TEAM: 'time_entry:read_team',
  TIME_ENTRY_READ_ORG: 'time_entry:read_org',
  // timesheets
  TIMESHEET_CREATE: 'timesheet:create',
  TIMESHEET_READ: 'timesheet:read',
  TIMESHEET_UPDATE: 'timesheet:update',
  TIMESHEET_SUBMIT: 'timesheet:submit',
  TIMESHEET_READ_TEAM: 'timesheet:read_team',
  TIMESHEET_READ_ORG: 'timesheet:read_org',
  // scrum
  SCRUM_CREATE: 'scrum:create',
  SCRUM_READ: 'scrum:read',
  SCRUM_UPDATE: 'scrum:update',
  SCRUM_READ_TEAM: 'scrum:read_team',
  // kpi
  KPI_TEMPLATE_READ: 'kpi_template:read',
  KPI_TEMPLATE_CREATE: 'kpi_template:create',
  KPI_TEMPLATE_UPDATE: 'kpi_template:update',
  KPI_TEMPLATE_DELETE: 'kpi_template:delete',
  KPI_PROGRESS_READ: 'kpi_progress:read',
  KPI_PROGRESS_READ_TEAM: 'kpi_progress:read_team',
  KPI_PROGRESS_READ_ORG: 'kpi_progress:read_org',
  KPI_READ_ORG: 'kpi:read_org', // org-level KPI dashboards/reports
  // approvals
  APPROVAL_READ_TEAM: 'approval:read_team',
  APPROVAL_DECIDE: 'approval:decide',
  APPROVAL_REMARK: 'approval:remark',
  // payroll
  PAYROLL_READ_SELF: 'payroll:read_self',
  PAYROLL_READ_STATUS_TEAM: 'payroll:read_status_team',
  PAYROLL_READ: 'payroll:read', // org-level payroll dashboards/reports (amounts) — Finance/Admin
  PAYROLL_PERIOD_READ: 'payroll_period:read',
  PAYROLL_PERIOD_CREATE: 'payroll_period:create',
  PAYROLL_PERIOD_UPDATE: 'payroll_period:update',
  PAYROLL_GENERATE: 'payroll:generate',
  PAYROLL_EXPORT: 'payroll:export',
  PAYROLL_RATE_READ: 'payroll_rate:read',
  PAYROLL_RATE_UPDATE: 'payroll_rate:update',
  // attendance / dashboard
  ATTENDANCE_READ_ORG: 'attendance:read_org',
  DASHBOARD_READ_SELF: 'dashboard:read_self',
  DASHBOARD_READ_TEAM: 'dashboard:read_team',
  DASHBOARD_READ_ORG: 'dashboard:read_org',
  // notifications
  NOTIFICATION_READ_SELF: 'notification:read_self',
  NOTIFICATION_UPDATE_SELF: 'notification:update_self',
  // ai
  AI_TRIGGER_SELF: 'ai:trigger_self',
  AI_TRIGGER_TEAM: 'ai:trigger_team',
  AI_TRIGGER_ORG: 'ai:trigger_org',
  AI_READ: 'ai:read',
  // audit
  AUDIT_READ_SCOPED: 'audit:read_scoped',
  AUDIT_READ_ORG: 'audit:read_org',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All permission strings (for seeding the `permissions` table). */
export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

const P = PERMISSIONS;

/** Read-only permissions shared by all org members (used by pickers). */
const ORG_READ_PERMS = [
  P.DEPARTMENT_READ,
  P.TEAM_READ,
  P.PROJECT_READ,
  P.CLIENT_READ,
  P.WORK_CATEGORY_READ,
] as const;

/**
 * Maps application roles to their permissions (Phase 1 matrix).
 *
 * ADMIN uses the `*` wildcard, which is resolved by the PermissionsGuard.
 *
 * Note:
 * Intern is NOT an access role. Interns are assigned the EMPLOYEE role
 * with `employment_type = INTERN`.
 *
 * Payroll eligibility is determined by the `payroll_eligible` flag,
 * not by the user's role or employment type.
 */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  [Role.ADMIN]: ['*'],
  [Role.EMPLOYEE]: [
    P.USER_READ_SELF,
    ...ORG_READ_PERMS,
    P.TIME_ENTRY_CREATE, P.TIME_ENTRY_READ, P.TIME_ENTRY_UPDATE, P.TIME_ENTRY_DELETE,
    P.TIMESHEET_CREATE, P.TIMESHEET_READ, P.TIMESHEET_UPDATE, P.TIMESHEET_SUBMIT,
    P.SCRUM_CREATE, P.SCRUM_READ, P.SCRUM_UPDATE,
    P.KPI_PROGRESS_READ, P.KPI_TEMPLATE_READ,
    P.PAYROLL_READ_SELF,
    P.NOTIFICATION_READ_SELF, P.NOTIFICATION_UPDATE_SELF,
    P.AI_TRIGGER_SELF, P.AI_READ,
    P.DASHBOARD_READ_SELF,
    P.HOLIDAY_READ,
  ],
  [Role.SUPERVISOR]: [
    P.USER_READ_SELF, P.USER_READ,
    ...ORG_READ_PERMS,
    P.TIME_ENTRY_CREATE, P.TIME_ENTRY_READ, P.TIME_ENTRY_UPDATE, P.TIME_ENTRY_DELETE, P.TIME_ENTRY_READ_TEAM,
    P.TIMESHEET_CREATE, P.TIMESHEET_READ, P.TIMESHEET_UPDATE, P.TIMESHEET_SUBMIT, P.TIMESHEET_READ_TEAM,
    P.SCRUM_CREATE, P.SCRUM_READ, P.SCRUM_UPDATE, P.SCRUM_READ_TEAM,
    P.KPI_PROGRESS_READ, P.KPI_PROGRESS_READ_TEAM, P.KPI_TEMPLATE_READ,
    P.APPROVAL_READ_TEAM, P.APPROVAL_DECIDE, P.APPROVAL_REMARK,
    P.PAYROLL_READ_STATUS_TEAM,
    P.NOTIFICATION_READ_SELF, P.NOTIFICATION_UPDATE_SELF,
    P.AI_TRIGGER_SELF, P.AI_TRIGGER_TEAM, P.AI_READ,
    P.DASHBOARD_READ_SELF, P.DASHBOARD_READ_TEAM,
    P.HOLIDAY_READ,
  ],
  [Role.HR]: [
    P.USER_READ_SELF, P.USER_READ,
    ...ORG_READ_PERMS,
    P.TIMESHEET_READ, P.TIMESHEET_READ_ORG,
    P.KPI_PROGRESS_READ_ORG, P.KPI_READ_ORG, P.KPI_TEMPLATE_READ,
    P.ATTENDANCE_READ_ORG,
    P.PAYROLL_PERIOD_READ,
    P.AUDIT_READ_SCOPED,
    P.NOTIFICATION_READ_SELF, P.NOTIFICATION_UPDATE_SELF,
    P.AI_TRIGGER_ORG, P.AI_READ,
    P.DASHBOARD_READ_ORG,
    P.ORG_READ, P.ORG_SETTINGS_READ, P.HOLIDAY_READ, P.HOLIDAY_WRITE,
  ],
  [Role.FINANCE]: [
    P.USER_READ_SELF, P.USER_READ,
    ...ORG_READ_PERMS,
    P.TIMESHEET_READ, P.TIMESHEET_READ_ORG,
    P.KPI_PROGRESS_READ_ORG, P.KPI_READ_ORG,
    P.PAYROLL_READ, P.PAYROLL_PERIOD_READ, P.PAYROLL_PERIOD_CREATE, P.PAYROLL_PERIOD_UPDATE,
    P.PAYROLL_GENERATE, P.PAYROLL_EXPORT,
    P.PAYROLL_RATE_READ, P.PAYROLL_RATE_UPDATE,
    P.AUDIT_READ_SCOPED,
    P.NOTIFICATION_READ_SELF, P.NOTIFICATION_UPDATE_SELF,
    P.AI_TRIGGER_ORG, P.AI_READ,
    P.DASHBOARD_READ_ORG,
    P.ORG_READ, P.ORG_SETTINGS_READ, P.ORG_SETTINGS_UPDATE,
  ],
};
