import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';

// ─── Menu item definition ──────────────────────────────────────────────────────

interface MenuItemDef {
  id: string;
  label: string;
  icon: string; // Lucide icon key (kebab-case)
  route: string;
  section: 'WORKSPACE' | 'MANAGEMENT' | 'FINANCE_REPORTS' | 'FINANCE' | 'SYSTEM';
  /** The `resource:action` permission that gates visibility. */
  permission: string;
  /** Optional: which badge counter to attach. */
  badge?: 'pendingApprovals' | 'unreadNotifications' | 'pendingPayroll' | 'pendingTimesheets';
}

/**
 * Static menu catalog — the single source of truth for sidebar navigation.
 * To add a new module in the future, just append an entry here.
 */
const MENU_CATALOG: MenuItemDef[] = [
  // ── WORKSPACE ──
  { id: 'dashboard',    label: 'Dashboard',    icon: 'layout-grid',  route: '/dashboard',          section: 'WORKSPACE',        permission: 'dashboard:read_self' },
  { id: 'daily-scrum',  label: 'Daily Scrum',  icon: 'timer',        route: '/time-tracking',      section: 'WORKSPACE',        permission: 'scrum:read' },
  { id: 'timesheets',   label: 'Timesheets',   icon: 'file-text',    route: '/timesheets',         section: 'WORKSPACE',        permission: 'timesheet:read',            badge: 'pendingTimesheets' },
  { id: 'my-schedule',  label: 'My Schedule',  icon: 'calendar-days', route: '/schedules',         section: 'WORKSPACE',        permission: 'schedule:read' },
  { id: 'schedules',    label: 'Team Schedules', icon: 'calendar-days', route: '/schedules',       section: 'MANAGEMENT',       permission: 'schedule:read_team' },
  { id: 'kpi-dashboard', label: 'KPI Dashboard', icon: 'target',       route: '/kpi-dashboard',   section: 'MANAGEMENT',       permission: 'kpi_progress:read_team' },
  { id: 'supervisor-ai-insights', label: 'AI Insights', icon: 'sparkles', route: '/supervisor/ai-insights', section: 'MANAGEMENT', permission: 'ai:trigger_team' },
  { id: 'supervisor-leave', label: 'Leave Management', icon: 'calendar-clock', route: '/supervisor/leave', section: 'MANAGEMENT', permission: 'leave_request:decide' },
  // ── MANAGEMENT ──
  { id: 'employees',    label: 'Employees',    icon: 'users',        route: '/admin/employees',    section: 'MANAGEMENT',       permission: 'user:read' },
  { id: 'departments',  label: 'Departments',  icon: 'building-2',   route: '/admin/departments',  section: 'MANAGEMENT',       permission: 'org:read_dashboard' },
  { id: 'approvals',    label: 'Approvals',    icon: 'check-square', route: '/admin/approvals',    section: 'MANAGEMENT',       permission: 'user:update',               badge: 'pendingApprovals' },
  // ── FINANCE & REPORTS ──
  { id: 'payroll',      label: 'Payroll',      icon: 'wallet',       route: '/payslips',           section: 'FINANCE_REPORTS',  permission: 'payroll:read_self',         badge: 'pendingPayroll' },
  { id: 'hr-ai-insights', label: 'AI Insights', icon: 'sparkles', route: '/admin/ai-insights', section: 'FINANCE_REPORTS', permission: 'dashboard:read_org' },
  { id: 'attendance-reports', label: 'Attendance Reports', icon: 'clipboard-check', route: '/admin/attendance-reports', section: 'FINANCE_REPORTS', permission: 'attendance:read_org' },
  { id: 'reports',      label: 'Reports',      icon: 'bar-chart-3',  route: '/reports',            section: 'FINANCE_REPORTS',  permission: 'dashboard:read_team' },
  { id: 'productivity-report', label: 'Productivity Report', icon: 'file-text', route: '/reports/productivity', section: 'FINANCE_REPORTS', permission: 'dashboard:read_team' },
  { id: 'performance',  label: 'Performance Report',  icon: 'bar-chart-3',  route: '/performance',        section: 'FINANCE_REPORTS',  permission: 'dashboard:read_self' },
  // ── FINANCE WORKSPACE (entry points) ──
  { id: 'finance-dashboard',    label: 'Finance Dashboard',    icon: 'layout-grid',      route: '/finance/dashboard',         section: 'FINANCE',  permission: 'payroll:read' },
  { id: 'finance-payroll',      label: 'Payroll Processing',   icon: 'wallet',           route: '/finance/payroll-processing', section: 'FINANCE',  permission: 'payroll:read' },
  { id: 'finance-reports',      label: 'Financial Reports',     icon: 'bar-chart-3',      route: '/finance/reports',            section: 'FINANCE',  permission: 'payroll:read' },
  { id: 'finance-ai-insights',  label: 'AI Insights',          icon: 'sparkles',         route: '/finance/ai-insights',        section: 'FINANCE',  permission: 'payroll:read' },
  // ── SYSTEM ──
  { id: 'system-logs',  label: 'System Logs',  icon: 'scroll-text',  route: '/admin/security',     section: 'SYSTEM',           permission: 'audit:read_org' },
  { id: 'ai-config',    label: 'AI Settings',  icon: 'sparkles',     route: '/admin/ai-config',    section: 'SYSTEM',           permission: 'org:read' },
  { id: 'kpi-management', label: 'KPI Management', icon: 'target', route: '/admin/kpi-management', section: 'SYSTEM',         permission: 'kpi_template:update' },
];

// ─── Response shapes ────────────────────────────────────────────────────────────

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  section: string;
  badgeCount: number;
  permission: string;
  visible: true;
}

export interface SidebarResponse {
  workspace: { name: string };
  organization: { id: string; name: string; logoUrl: string | null };
  user: { id: string; firstName: string; lastName: string; roles: string[] };
  menu: SidebarMenuItem[];
}

// ─── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class NavigationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSidebar(user: AuthPrincipal): Promise<SidebarResponse> {
    // Already resolved (DB-backed) by JwtStrategy and attached to the request
    // principal — no need to re-resolve from roles here.
    const permissions = user.permissions;
    const isAdmin = permissions.includes('*');

    const isSupervisorOnly = user.roles.includes('SUPERVISOR') && !isAdmin;
    const isHrOnly = user.roles.includes('HR') && !isAdmin;
    const isEmployeeOnly = (user.roles.includes('EMPLOYEE') || user.roles.includes('INTERN')) && !isAdmin
      && !user.roles.includes('SUPERVISOR') && !user.roles.includes('HR');

    // Filter menu by permission
    const visibleItems = MENU_CATALOG.filter((item) => {
      // "My Schedule" is the employee/intern self-view of their own shifts.
      // Supervisors, HR, and Admin see "Team Schedules" instead.
      if (item.id === 'my-schedule') return isEmployeeOnly;
      // "Team Schedules" is for managers — hide from pure employees/interns who
      // already see "My Schedule" above.
      if (item.id === 'schedules' && isEmployeeOnly) return false;
      // Performance Insights is an individual-contributor view — employees only.
      if (item.id === 'performance') return user.roles.includes('EMPLOYEE');
      // Team KPI Dashboard is a direct-reports management tool — supervisors only.
      if (item.id === 'kpi-dashboard') return user.roles.includes('SUPERVISOR');
      // Supervisor's AI Insights tool is distinct from the org-wide one Admin/HR see
      // at hr-ai-insights (/admin/ai-insights) — without this, Admin's wildcard
      // permission would show both under the same "AI Insights" label.
      if (item.id === 'supervisor-ai-insights') return user.roles.includes('SUPERVISOR');
      // Supervisors get a focused workspace: no org-wide Employees/Reports sections.
      if (isSupervisorOnly && (item.id === 'employees' || item.id === 'reports')) return false;
      // HR validates attendance/hours and prepares payroll; administering Employees
      // and Departments, and system settings (SYSTEM section), belong to the Admin.
      if (isHrOnly && (item.id === 'employees' || item.id === 'departments' || item.section === 'SYSTEM')) return false;
      // HR uses Payroll Processing for timesheet workflows, not the standard employee/supervisor Timesheets page.
      if (isHrOnly && item.id === 'timesheets') return false;
      // Finance has its own dedicated workspace (section 'FINANCE' below, exactly 4 items:
      // Dashboard, Payroll Processing, Financial Reports, AI Insights). Finance's broad
      // permission set (payroll_period:read, dashboard:read_org, user:read, org:read, etc.)
      // would otherwise leak unrelated WORKSPACE/MANAGEMENT/FINANCE_REPORTS/SYSTEM items in —
      // exclude everything outside the FINANCE section for Finance-only users.
      if (user.roles.includes('FINANCE') && !isAdmin) return item.section === 'FINANCE';
      // HR runs payroll processing (payroll_period:read), not the self-payslip view (payroll:read_self).
      if (item.id === 'payroll') return isAdmin || permissions.includes(item.permission) || permissions.includes('payroll_period:read');
      // The Finance workspace (its own dedicated shell/sidebar) is for the FINANCE role only —
      // HR and Admin also hold payroll:read, which would otherwise duplicate this section for them.
      if (item.section === 'FINANCE') return user.roles.includes('FINANCE');
      return isAdmin || permissions.includes(item.permission);
    });

    // Aggregate badge counts in parallel
    const badges = await this.aggregateBadges(user, permissions, visibleItems);

    // Fetch org + user profile in parallel
    const [org, profile] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: user.organizationId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    const menu: SidebarMenuItem[] = visibleItems.map((item) => {
      let route = item.route;
      let label = item.label;
      if (item.id === 'payroll' && (isAdmin || permissions.includes('payroll:read'))) {
        route = '/admin/payroll';
      }
      // HR runs the dedicated Payroll Processing wizard, not the Finance oversight page.
      if (item.id === 'payroll' && user.roles.includes('HR') && !isAdmin) {
        route = '/hr/payroll-processing';
        label = 'Payroll Processing';
      }
      if (item.id === 'reports' && (isAdmin || permissions.includes('dashboard:read_team') || permissions.includes('org:read_dashboard'))) {
        route = '/admin/reports';
      }
      if (item.id === 'timesheets' && (isAdmin || permissions.includes('timesheet:read_org'))) {
        route = '/admin/timesheets';
      }
      // Supervisors land on the per-employee Team Scrum Submissions review, not the personal entry page.
      if (item.id === 'daily-scrum' && isSupervisorOnly) {
        route = '/team-scrum';
        label = 'Team Scrum';
      }
      return {
        id: item.id,
        label,
        icon: item.icon,
        route,
        section: item.section,
        badgeCount: item.badge ? (badges[item.badge] ?? 0) : 0,
        permission: item.permission,
        visible: true as const,
      };
    });

    return {
      workspace: { name: org?.name ?? 'TimeForge' },
      organization: {
        id: org?.id ?? user.organizationId,
        name: org?.name ?? 'Organization',
        logoUrl: null,
      },
      user: {
        id: profile?.id ?? user.userId,
        firstName: profile?.firstName ?? '',
        lastName: profile?.lastName ?? '',
        roles: user.roles,
      },
      menu,
    };
  }

  // ─── Badge aggregation ──────────────────────────────────────────────────

  private async aggregateBadges(
    user: AuthPrincipal,
    permissions: string[],
    visibleItems: MenuItemDef[],
  ): Promise<Record<string, number>> {
    const badgesNeeded = new Set(visibleItems.map((i) => i.badge).filter(Boolean) as string[]);
    const result: Record<string, number> = {};

    const promises: Promise<void>[] = [];

    if (badgesNeeded.has('pendingApprovals')) {
      promises.push(
        this.countPendingApprovals(user).then((n) => { result['pendingApprovals'] = n; }),
      );
    }

    if (badgesNeeded.has('unreadNotifications')) {
      promises.push(
        this.countUnreadNotifications(user).then((n) => { result['unreadNotifications'] = n; }),
      );
    }

    if (badgesNeeded.has('pendingPayroll')) {
      promises.push(
        this.countPendingPayroll(user, permissions).then((n) => { result['pendingPayroll'] = n; }),
      );
    }

    if (badgesNeeded.has('pendingTimesheets')) {
      promises.push(
        this.countPendingTimesheets(user).then((n) => { result['pendingTimesheets'] = n; }),
      );
    }

    await Promise.all(promises);
    return result;
  }

  /** PENDING self-registrations awaiting an Admin's approve/reject decision. Only
   *  Admins ever see this badge (the 'approvals' nav item requires user:update). */
  private async countPendingApprovals(user: AuthPrincipal): Promise<number> {
    return this.prisma.user.count({
      where: { tenantId: user.tenantId, organizationId: user.organizationId, status: 'PENDING', deletedAt: null },
    });
  }

  /** Unread notification count for the current user. */
  private async countUnreadNotifications(user: AuthPrincipal): Promise<number> {
    return this.prisma.notification.count({
      where: { tenantId: user.tenantId, userId: user.userId, isRead: false, isArchived: false, deletedAt: null },
    });
  }

  /** Open payroll periods (visible only to Finance / Admin). */
  private async countPendingPayroll(user: AuthPrincipal, permissions: string[]): Promise<number> {
    const canSeePayroll = permissions.includes('*') || permissions.includes('payroll:read') || permissions.includes('payroll_period:read');
    if (!canSeePayroll) return 0;

    return this.prisma.payrollPeriod.count({
      where: {
        tenantId: user.tenantId,
        organizationId: user.organizationId,
        status: 'OPEN',
        deletedAt: null,
      },
    });
  }

  /** Draft timesheets for the current user. */
  private async countPendingTimesheets(user: AuthPrincipal): Promise<number> {
    return this.prisma.timesheet.count({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        status: 'DRAFT',
        deletedAt: null,
      },
    });
  }
}
