/**
 * Route → permission map for client-side page-level RBAC.
 * Mirrors the backend MENU_CATALOG (navigation.service.ts) — the backend
 * remains the security source of truth; this only prevents unauthorized
 * users from seeing pages they shouldn't.
 *
 * When adding a new route, add it here AND in the backend MENU_CATALOG.
 */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  // workspace
  '/dashboard': 'dashboard:read_self',
  '/time-tracking': 'scrum:read',
  '/timesheets': 'timesheet:read',
  '/schedules': 'schedule:read_team',
  '/kpi-dashboard': 'kpi_progress:read_team',
  '/supervisor/ai-insights': 'ai:trigger_team',
  '/supervisor/leave': 'leave_request:decide',
  // management
  '/admin/employees': 'user:read',
  '/admin/departments': 'org:read_dashboard',
  '/admin/approvals': 'user:update',
  // finance & reports
  '/payslips': 'payroll:read_self',
  '/admin/ai-insights': 'dashboard:read_org',
  '/admin/attendance-reports': 'attendance:read_org',
  '/reports': 'dashboard:read_team',
  '/reports/productivity': 'dashboard:read_team',
  '/performance': 'dashboard:read_self',
  // finance (separate shell)
  '/finance/dashboard': 'payroll:read',
  '/finance/payroll-processing': 'payroll:read',
  '/finance/reports': 'payroll:read',
  '/finance/ai-insights': 'payroll:read',
  // system
  '/admin/security': 'audit:read_org',
  '/admin/ai-config': 'org:read',
  // additional routes not in MENU_CATALOG but still protected
  '/admin/timesheets': 'timesheet:read_org',
  '/admin/payroll': 'payroll:read',
  '/admin/payroll-processing': 'payroll_period:read',
  '/admin/reports': 'dashboard:read_org',
  '/admin/performance': 'dashboard:read_self',
  '/admin/audit-logs': 'audit:read_org',
  '/settings': 'dashboard:read_self',
  '/support': 'dashboard:read_self',
  '/team-scrum': 'scrum:read_team',
};

export function getRequiredPermission(pathname: string): string | null {
  // Exact match first
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];

  // Dynamic route match (e.g. /admin/employees/123 → /admin/employees)
  const parts = pathname.split('/').filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const prefix = '/' + parts.slice(0, i).join('/');
    if (ROUTE_PERMISSIONS[prefix]) return ROUTE_PERMISSIONS[prefix];
  }

  return null;
}
