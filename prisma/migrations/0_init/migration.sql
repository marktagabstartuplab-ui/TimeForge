-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('EMPLOYEE', 'INTERN', 'CONTRACTOR', 'PART_TIME', 'FULL_TIME');

-- CreateEnum
CREATE TYPE "ScrumTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScrumTaskItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScrumTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ScrumEditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BlockerSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SessionEventType" AS ENUM ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'TASK_COMPLETED', 'CLOCK_OUT');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('GITHUB', 'FIGMA', 'PR', 'GOOGLE_DOCS', 'OTHER_LINK', 'FILE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'REVISION_REQUEST', 'PAYROLL_EXPORT', 'ROLE_CHANGE', 'PASSWORD_CHANGE', 'AI_USAGE', 'SETTINGS_CHANGE', 'ADMIN_ACTION', 'PAYROLL_VALIDATED', 'PAYROLL_APPROVED', 'PAYROLL_REJECTED', 'PAYROLL_SENT_TO_BANK', 'TIME_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'PERSONAL');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('TIMER', 'MANUAL');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'PAYROLL_READY');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_REVISION');

-- CreateEnum
CREATE TYPE "KpiMetricType" AS ENUM ('COUNT', 'HOURS', 'PERCENT', 'CURRENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "KpiPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'PAYROLL_PERIOD');

-- CreateEnum
CREATE TYPE "PayrollPeriodType" AS ENUM ('FIRST_HALF', 'SECOND_HALF', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'GENERATED', 'LOCKED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "PayrollProcessingStatus" AS ENUM ('DRAFT', 'VALIDATING', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_TO_BANK');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED');

-- CreateEnum
CREATE TYPE "holiday_type" AS ENUM ('REGULAR', 'SPECIAL_NON_WORKING');

-- CreateEnum
CREATE TYPE "recurring_issue_category" AS ENUM ('BLOCKER', 'DELAY');

-- CreateEnum
CREATE TYPE "recurring_issue_trend" AS ENUM ('INCREASING', 'STABLE', 'DECREASING');

-- CreateEnum
CREATE TYPE "recurring_issue_status" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "shift_violation_type" AS ENUM ('REACHED_LIMIT', 'AUTO_CLOCKED_OUT', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "shift_supervisor_action" AS ENUM ('NO_ACTION', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "shift_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "shift_type" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('SUBMISSION', 'APPROVAL_DECISION', 'REJECTION', 'REVISION_REQUEST', 'DEADLINE', 'PAYROLL_READY', 'AI_REPORT', 'EMPLOYEE_APPROVAL_REQUEST', 'SCRUM_TASK_COMPLETED', 'SCRUM_ENTRY_LOCKED', 'SCRUM_BLOCKER_ADDED', 'DEPARTMENT_CHANGED', 'ROLE_CHANGED', 'ANNOUNCEMENT', 'PASSWORD_CHANGED', 'RECURRING_ISSUE_DETECTED', 'TIME_ADJUSTED', 'SHIFT_LIMIT_WARNING', 'SHIFT_AUTO_CLOCKED_OUT', 'SHIFT_OVERRIDE_REQUESTED', 'SHIFT_OVERRIDE_DECISION');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "notification_category" AS ENUM ('DAILY_SCRUM', 'TIMESHEETS', 'PAYROLL', 'ACCOUNT', 'SYSTEM', 'SCHEDULE', 'SECURITY', 'LEAVE', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "notification_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "ai_feature" AS ENUM ('DAILY_SUMMARY', 'WEEKLY_SUMMARY', 'TIMESHEET_SUMMARY', 'PAYROLL_VALIDATION', 'KPI_ANALYSIS', 'BLOCKER_DETECTION', 'PRODUCTIVITY_INSIGHT', 'SUPERVISOR_ADVISORY', 'FINANCE_REPORT', 'STANDUP_DRAFT', 'BLOCKER_ADVISORY', 'KPI_COPILOT', 'INTERN_ADVISORY', 'IMPROVE_DESCRIPTION');

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('OPENAI', 'ANTHROPIC', 'LOCAL');

-- CreateEnum
CREATE TYPE "ai_job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SecurityStatus" AS ENUM ('SUCCESS', 'DENIED', 'PENDING');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('ATTENDANCE', 'PAYROLL', 'TIMESHEETS', 'LABOR_COST', 'COMPLIANCE', 'DEPARTMENT_ANALYTICS');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "bug_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "bug_priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "bug_severity" AS ENUM ('P0', 'P1', 'P2', 'P3', 'P4');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'json',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "job_title" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "requested_role" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'EMPLOYEE',
    "hourly_rate" DECIMAL(12,2),
    "payroll_eligible" BOOLEAN NOT NULL DEFAULT true,
    "avatar_key" TEXT,
    "last_login_at" TIMESTAMPTZ,
    "email_verified_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "supervisor_id" UUID,
    "department_id" UUID,
    "team_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "lockout_until" TIMESTAMPTZ,
    "email_verification_token" TEXT,
    "email_verification_expires_at" TIMESTAMPTZ,
    "password_reset_token" TEXT,
    "password_reset_expires_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT,
    "result_ref" TEXT,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "manager_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID,
    "supervisor_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "client_id" UUID,
    "department_id" UUID,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ON_TRACK',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "holiday_type" NOT NULL DEFAULT 'REGULAR',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "timesheet_id" UUID,
    "work_session_id" UUID,
    "project_id" UUID,
    "client_id" UUID,
    "work_category_id" UUID,
    "source" "TimeEntrySource" NOT NULL DEFAULT 'MANUAL',
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ,
    "duration_minutes" INTEGER,
    "task" TEXT,
    "description" TEXT,
    "deliverables" TEXT,
    "department_id" UUID,
    "reference_links" JSONB,
    "attachments" JSONB,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "total_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes_override" INTEGER,
    "summary" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "decided_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrum_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "yesterday" TEXT NOT NULL,
    "today" TEXT NOT NULL,
    "blockers" TEXT,
    "notes" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "ScrumTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ,
    "project_id" UUID,
    "client_id" UUID,
    "kpi" TEXT,
    "planned_target" TEXT,
    "supervisor_note" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrum_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrum_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scrum_entry_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expected_output" TEXT NOT NULL,
    "measurement" TEXT NOT NULL,
    "project_id" UUID,
    "task_status" "ScrumTaskItemStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ,
    "estimated_hours" DECIMAL(6,2),
    "actual_hours" DECIMAL(6,2),
    "priority" "ScrumTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "kpi" TEXT,
    "planned_target" TEXT,
    "actual_completed" TEXT,
    "continue_tomorrow" BOOLEAN,
    "not_completed_reason" TEXT,
    "kpi_template_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrum_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrum_edit_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scrum_entry_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ScrumEditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrum_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrum_blockers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scrum_entry_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "BlockerSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BlockerStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrum_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_issues" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category" "recurring_issue_category" NOT NULL,
    "issue_text" TEXT NOT NULL,
    "department_id" UUID,
    "project_id" UUID,
    "employee_ids" UUID[],
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "first_occurrence" TIMESTAMPTZ NOT NULL,
    "last_occurrence" TIMESTAMPTZ NOT NULL,
    "trend" "recurring_issue_trend" NOT NULL DEFAULT 'STABLE',
    "suggested_action" TEXT,
    "status" "recurring_issue_status" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recurring_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "clock_in" TIMESTAMPTZ NOT NULL,
    "clock_out" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_break_started_at" TIMESTAMPTZ,
    "break_count" INTEGER NOT NULL DEFAULT 0,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "session_duration_minutes" INTEGER,
    "shift_configuration_id" UUID,
    "max_clock_out_at" TIMESTAMPTZ,
    "is_auto_clocked_out" BOOLEAN NOT NULL DEFAULT false,
    "auto_clock_out_reason" TEXT,
    "requires_override" BOOLEAN NOT NULL DEFAULT false,
    "supervisor_override_id" UUID,
    "override_approved" BOOLEAN,
    "override_approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_configurations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shift_name" TEXT NOT NULL DEFAULT 'Standard',
    "max_shift_minutes" INTEGER NOT NULL DEFAULT 720,
    "grace_period_minutes" INTEGER NOT NULL DEFAULT 0,
    "requires_supervisor_override" BOOLEAN NOT NULL DEFAULT true,
    "warning_lead_minutes" INTEGER NOT NULL DEFAULT 60,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shift_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_limit_violations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "work_session_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "shift_configuration_id" UUID,
    "violation_type" "shift_violation_type" NOT NULL,
    "violation_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes_worked_at_violation" INTEGER NOT NULL,
    "requested_extension_minutes" INTEGER,
    "supervisor_action" "shift_supervisor_action" NOT NULL DEFAULT 'NO_ACTION',
    "supervisor_id" UUID,
    "supervisor_action_at" TIMESTAMPTZ,
    "supervisor_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shift_limit_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_session_id" UUID NOT NULL,
    "event_type" "SessionEventType" NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "work_session_id" UUID,
    "scrum_task_id" UUID,
    "type" "AttachmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "storage_key" TEXT,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID,
    "shift_date" DATE NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ NOT NULL,
    "shift_type" "shift_type" NOT NULL DEFAULT 'CUSTOM',
    "status" "shift_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "supervisor_id" UUID NOT NULL,
    "last_action" "ApprovalAction" NOT NULL,
    "resulting_state" "TimesheetStatus" NOT NULL,
    "remark" TEXT,
    "acted_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "attachment_key" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "used_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric_type" "KpiMetricType" NOT NULL,
    "period" "KpiPeriod" NOT NULL,
    "target_value" DECIMAL(12,2) NOT NULL,
    "applies_to" JSONB,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "formula" TEXT,
    "validation_rules" JSONB,
    "display_format" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kpi_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_progress" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kpi_template_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "current_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "target_value" DECIMAL(12,2) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kpi_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sss_employee_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
    "sss_employer_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
    "sss_salary_ceiling" DECIMAL(12,2) NOT NULL DEFAULT 29500,
    "philhealth_employee_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.025,
    "philhealth_employer_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.025,
    "philhealth_min" DECIMAL(12,2) NOT NULL DEFAULT 500,
    "philhealth_max" DECIMAL(12,2) NOT NULL DEFAULT 5000,
    "pagibig_employee_rate_low" DECIMAL(6,4) NOT NULL DEFAULT 0.01,
    "pagibig_employee_rate_high" DECIMAL(6,4) NOT NULL DEFAULT 0.02,
    "pagibig_employer_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.02,
    "pagibig_salary_threshold" DECIMAL(12,2) NOT NULL DEFAULT 1500,
    "pagibig_employee_cap" DECIMAL(12,2) NOT NULL DEFAULT 200,
    "night_shift_premium" DECIMAL(5,2) NOT NULL DEFAULT 1.10,
    "night_shift_start_hour" INTEGER NOT NULL DEFAULT 22,
    "night_shift_end_hour" INTEGER NOT NULL DEFAULT 6,
    "regular_holiday_worked_rate" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "regular_holiday_unworked_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "special_holiday_worked_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.30,
    "thirteenth_month_exemption_cap" DECIMAL(12,2) NOT NULL DEFAULT 90000,
    "bir_tax_table_year" INTEGER NOT NULL DEFAULT 2026,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bir_tax_tables" (
    "id" UUID NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bir_tax_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bir_tax_brackets" (
    "id" UUID NOT NULL,
    "bir_tax_table_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "min_income" DECIMAL(14,2) NOT NULL,
    "max_income" DECIMAL(14,2),
    "base_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bir_tax_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "PayrollPeriodType" NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "locked_at" TIMESTAMPTZ,
    "exported_at" TIMESTAMPTZ,
    "processing_status" "PayrollProcessingStatus" NOT NULL DEFAULT 'DRAFT',
    "validated_at" TIMESTAMPTZ,
    "validated_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "approved_by" UUID,
    "rejected_at" TIMESTAMPTZ,
    "rejected_by" UUID,
    "rejection_reason" TEXT,
    "sent_to_bank_at" TIMESTAMPTZ,
    "sent_to_bank_by" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "generated_by" UUID NOT NULL,
    "export_pdf_key" TEXT,
    "export_xlsx_key" TEXT,
    "totals" JSONB,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payroll_report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "approved_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pending_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rejected_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "hourly_rate" DECIMAL(12,2) NOT NULL,
    "estimated_pay" DECIMAL(14,2) NOT NULL,
    "holiday_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "night_diff_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "regular_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overtime_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "night_differential" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "holiday_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sss_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "philhealth_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pagibig_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "income_tax_withheld" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sss_employer_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "philhealth_employer_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pagibig_employer_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gross_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ytd_taxable_income" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ytd_tax_withheld" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_thirteenth_month" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sender_id" UUID,
    "type" "notification_type" NOT NULL,
    "category" "notification_category" NOT NULL,
    "priority" "notification_priority" NOT NULL DEFAULT 'NORMAL',
    "channel" "notification_channel" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action_url" TEXT,
    "action_label" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "feature" "ai_feature" NOT NULL,
    "provider" "ai_provider" NOT NULL DEFAULT 'ANTHROPIC',
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "status" "ai_job_status" NOT NULL DEFAULT 'QUEUED',
    "subject_id" UUID,
    "subject_type" TEXT,
    "total_tokens" INTEGER,
    "cost" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "error_msg" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_audit" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ai_job_id" UUID NOT NULL,
    "prompt_hash" TEXT,
    "response_hash" TEXT,
    "execution_time_ms" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_results" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ai_job_id" UUID NOT NULL,
    "summary" TEXT,
    "recommendation" TEXT,
    "confidence" DECIMAL(5,4),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "status" "SecurityStatus" NOT NULL DEFAULT 'SUCCESS',
    "severity" "SecuritySeverity" NOT NULL DEFAULT 'INFO',
    "ip_address" TEXT NOT NULL,
    "geo_location" TEXT,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "SecuritySeverity" NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ip_address" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'PDF',
    "date_range" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "file_path" TEXT,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bugs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "issue" TEXT NOT NULL,
    "who_affected" TEXT NOT NULL,
    "what_i_see" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "error_message" TEXT,
    "where_it_happens" VARCHAR(255) NOT NULL,
    "status" "bug_status" NOT NULL DEFAULT 'OPEN',
    "priority" "bug_priority" NOT NULL DEFAULT 'MEDIUM',
    "severity" "bug_severity" NOT NULL DEFAULT 'P3',
    "reported_by" UUID NOT NULL,
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bug_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(255),
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bug_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_activity_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bug_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "old_value" VARCHAR(255),
    "new_value" VARCHAR(255),
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "organizations_tenant_id_slug_idx" ON "organizations"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "organizations_tenant_id_idx" ON "organizations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tenant_id_id_key" ON "organizations"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "organization_settings_tenant_id_organization_id_key_idx" ON "organization_settings"("tenant_id", "organization_id", "key");

-- CreateIndex
CREATE INDEX "users_tenant_id_email_idx" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "users_tenant_id_organization_id_idx" ON "users"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_team_id_idx" ON "users"("tenant_id", "team_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_organization_id_supervisor_id_idx" ON "users"("tenant_id", "organization_id", "supervisor_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_organization_id_status_idx" ON "users"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "users_tenant_id_organization_id_department_id_idx" ON "users"("tenant_id", "organization_id", "department_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_key" ON "users"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "roles_tenant_id_key_idx" ON "roles"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenant_id_user_id_idx" ON "refresh_tokens"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenant_id_expires_at_idx" ON "refresh_tokens"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_actor_id_created_at_idx" ON "audit_log"("tenant_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_type_entity_id_idx" ON "audit_log"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_type_action_created_at_idx" ON "audit_log"("tenant_id", "entity_type", "action", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_key_key" ON "idempotency_keys"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "departments_tenant_id_organization_id_name_idx" ON "departments"("tenant_id", "organization_id", "name");

-- CreateIndex
CREATE INDEX "teams_tenant_id_organization_id_name_idx" ON "teams"("tenant_id", "organization_id", "name");

-- CreateIndex
CREATE INDEX "clients_tenant_id_organization_id_name_idx" ON "clients"("tenant_id", "organization_id", "name");

-- CreateIndex
CREATE INDEX "projects_tenant_id_organization_id_code_idx" ON "projects"("tenant_id", "organization_id", "code");

-- CreateIndex
CREATE INDEX "projects_tenant_id_organization_id_department_id_idx" ON "projects"("tenant_id", "organization_id", "department_id");

-- CreateIndex
CREATE INDEX "work_categories_tenant_id_organization_id_name_idx" ON "work_categories"("tenant_id", "organization_id", "name");

-- CreateIndex
CREATE INDEX "holidays_tenant_id_organization_id_date_name_idx" ON "holidays"("tenant_id", "organization_id", "date", "name");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_user_id_start_time_idx" ON "time_entries"("tenant_id", "user_id", "start_time");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_organization_id_idx" ON "time_entries"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_department_id_idx" ON "time_entries"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_project_id_idx" ON "time_entries"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_client_id_idx" ON "time_entries"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "time_entries_timesheet_id_idx" ON "time_entries"("timesheet_id");

-- CreateIndex
CREATE INDEX "time_entries_work_session_id_idx" ON "time_entries"("work_session_id");

-- CreateIndex
CREATE INDEX "timesheets_tenant_id_user_id_period_start_idx" ON "timesheets"("tenant_id", "user_id", "period_start");

-- CreateIndex
CREATE INDEX "timesheets_tenant_id_status_organization_id_idx" ON "timesheets"("tenant_id", "status", "organization_id");

-- CreateIndex
CREATE INDEX "timesheets_tenant_id_organization_id_status_period_start_idx" ON "timesheets"("tenant_id", "organization_id", "status", "period_start");

-- CreateIndex
CREATE INDEX "scrum_entries_tenant_id_organization_id_entry_date_idx" ON "scrum_entries"("tenant_id", "organization_id", "entry_date");

-- CreateIndex
CREATE INDEX "scrum_entries_tenant_id_user_id_entry_date_idx" ON "scrum_entries"("tenant_id", "user_id", "entry_date");

-- CreateIndex
CREATE INDEX "scrum_entries_tenant_id_organization_id_submitted_at_idx" ON "scrum_entries"("tenant_id", "organization_id", "submitted_at");

-- CreateIndex
CREATE INDEX "scrum_tasks_tenant_id_scrum_entry_id_idx" ON "scrum_tasks"("tenant_id", "scrum_entry_id");

-- CreateIndex
CREATE INDEX "scrum_tasks_tenant_id_employee_id_idx" ON "scrum_tasks"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "scrum_edit_requests_tenant_id_scrum_entry_id_idx" ON "scrum_edit_requests"("tenant_id", "scrum_entry_id");

-- CreateIndex
CREATE INDEX "scrum_edit_requests_tenant_id_organization_id_status_idx" ON "scrum_edit_requests"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "scrum_edit_requests_tenant_id_requester_id_idx" ON "scrum_edit_requests"("tenant_id", "requester_id");

-- CreateIndex
CREATE INDEX "scrum_blockers_tenant_id_scrum_entry_id_idx" ON "scrum_blockers"("tenant_id", "scrum_entry_id");

-- CreateIndex
CREATE INDEX "scrum_blockers_tenant_id_organization_id_status_idx" ON "scrum_blockers"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "recurring_issues_tenant_id_organization_id_status_idx" ON "recurring_issues"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "recurring_issues_tenant_id_organization_id_department_id_idx" ON "recurring_issues"("tenant_id", "organization_id", "department_id");

-- CreateIndex
CREATE INDEX "recurring_issues_tenant_id_organization_id_project_id_idx" ON "recurring_issues"("tenant_id", "organization_id", "project_id");

-- CreateIndex
CREATE INDEX "recurring_issues_tenant_id_organization_id_last_occurrence_idx" ON "recurring_issues"("tenant_id", "organization_id", "last_occurrence");

-- CreateIndex
CREATE INDEX "work_sessions_tenant_id_user_id_work_date_idx" ON "work_sessions"("tenant_id", "user_id", "work_date");

-- CreateIndex
CREATE INDEX "work_sessions_is_active_max_clock_out_at_idx" ON "work_sessions"("is_active", "max_clock_out_at");

-- CreateIndex
CREATE INDEX "shift_configurations_tenant_id_organization_id_is_default_idx" ON "shift_configurations"("tenant_id", "organization_id", "is_default");

-- CreateIndex
CREATE INDEX "shift_limit_violations_tenant_id_work_session_id_idx" ON "shift_limit_violations"("tenant_id", "work_session_id");

-- CreateIndex
CREATE INDEX "shift_limit_violations_tenant_id_employee_id_violation_at_idx" ON "shift_limit_violations"("tenant_id", "employee_id", "violation_at");

-- CreateIndex
CREATE INDEX "shift_limit_violations_tenant_id_organization_id_supervisor_idx" ON "shift_limit_violations"("tenant_id", "organization_id", "supervisor_action");

-- CreateIndex
CREATE INDEX "session_events_tenant_id_work_session_id_occurred_at_idx" ON "session_events"("tenant_id", "work_session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "session_events_tenant_id_user_id_occurred_at_idx" ON "session_events"("tenant_id", "user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "session_attachments_tenant_id_work_session_id_idx" ON "session_attachments"("tenant_id", "work_session_id");

-- CreateIndex
CREATE INDEX "session_attachments_tenant_id_scrum_task_id_idx" ON "session_attachments"("tenant_id", "scrum_task_id");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_organization_id_shift_date_idx" ON "shifts"("tenant_id", "organization_id", "shift_date");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_user_id_shift_date_idx" ON "shifts"("tenant_id", "user_id", "shift_date");

-- CreateIndex
CREATE INDEX "approvals_tenant_id_timesheet_id_idx" ON "approvals"("tenant_id", "timesheet_id");

-- CreateIndex
CREATE INDEX "approvals_tenant_id_supervisor_id_resulting_state_idx" ON "approvals"("tenant_id", "supervisor_id", "resulting_state");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_user_id_status_idx" ON "leave_requests"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_organization_id_status_idx" ON "leave_requests"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_tenant_id_user_id_type_year_key" ON "leave_balances"("tenant_id", "user_id", "type", "year");

-- CreateIndex
CREATE INDEX "kpi_templates_tenant_id_organization_id_name_idx" ON "kpi_templates"("tenant_id", "organization_id", "name");

-- CreateIndex
CREATE INDEX "kpi_templates_tenant_id_organization_id_metric_type_idx" ON "kpi_templates"("tenant_id", "organization_id", "metric_type");

-- CreateIndex
CREATE INDEX "kpi_progress_tenant_id_kpi_template_id_user_id_period_key_idx" ON "kpi_progress"("tenant_id", "kpi_template_id", "user_id", "period_key");

-- CreateIndex
CREATE INDEX "kpi_progress_tenant_id_organization_id_user_id_idx" ON "kpi_progress"("tenant_id", "organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_tenant_id_organization_id_key" ON "payroll_settings"("tenant_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "bir_tax_tables_tax_year_key" ON "bir_tax_tables"("tax_year");

-- CreateIndex
CREATE INDEX "bir_tax_tables_tax_year_is_active_idx" ON "bir_tax_tables"("tax_year", "is_active");

-- CreateIndex
CREATE INDEX "bir_tax_brackets_bir_tax_table_id_min_income_idx" ON "bir_tax_brackets"("bir_tax_table_id", "min_income");

-- CreateIndex
CREATE UNIQUE INDEX "bir_tax_brackets_bir_tax_table_id_sequence_key" ON "bir_tax_brackets"("bir_tax_table_id", "sequence");

-- CreateIndex
CREATE INDEX "payroll_periods_tenant_id_organization_id_start_date_end_da_idx" ON "payroll_periods"("tenant_id", "organization_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "payroll_periods_tenant_id_organization_id_status_idx" ON "payroll_periods"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "payroll_reports_tenant_id_payroll_period_id_idx" ON "payroll_reports"("tenant_id", "payroll_period_id");

-- CreateIndex
CREATE INDEX "payroll_reports_tenant_id_organization_id_idx" ON "payroll_reports"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "payroll_line_items_tenant_id_payroll_report_id_idx" ON "payroll_line_items"("tenant_id", "payroll_report_id");

-- CreateIndex
CREATE INDEX "payroll_line_items_tenant_id_organization_id_idx" ON "payroll_line_items"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "payroll_line_items_tenant_id_user_id_idx" ON "payroll_line_items"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_items_payroll_report_id_user_id_key" ON "payroll_line_items"("payroll_report_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_is_read_created_at_idx" ON "notifications"("tenant_id", "user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_category_idx" ON "notifications"("tenant_id", "user_id", "category");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_organization_id_idx" ON "notifications"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "ai_jobs_tenant_id_status_created_at_idx" ON "ai_jobs"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_jobs_tenant_id_feature_subject_id_idx" ON "ai_jobs"("tenant_id", "feature", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_audit_ai_job_id_key" ON "ai_audit"("ai_job_id");

-- CreateIndex
CREATE INDEX "ai_audit_tenant_id_ai_job_id_idx" ON "ai_audit"("tenant_id", "ai_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_results_ai_job_id_key" ON "ai_results"("ai_job_id");

-- CreateIndex
CREATE INDEX "ai_results_tenant_id_ai_job_id_idx" ON "ai_results"("tenant_id", "ai_job_id");

-- CreateIndex
CREATE INDEX "security_logs_organization_id_idx" ON "security_logs"("organization_id");

-- CreateIndex
CREATE INDEX "security_logs_severity_idx" ON "security_logs"("severity");

-- CreateIndex
CREATE INDEX "security_logs_created_at_idx" ON "security_logs"("created_at");

-- CreateIndex
CREATE INDEX "security_logs_user_id_idx" ON "security_logs"("user_id");

-- CreateIndex
CREATE INDEX "security_logs_tenant_id_organization_id_idx" ON "security_logs"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "security_alerts_organization_id_idx" ON "security_alerts"("organization_id");

-- CreateIndex
CREATE INDEX "security_alerts_severity_idx" ON "security_alerts"("severity");

-- CreateIndex
CREATE INDEX "security_alerts_created_at_idx" ON "security_alerts"("created_at");

-- CreateIndex
CREATE INDEX "security_alerts_user_id_idx" ON "security_alerts"("user_id");

-- CreateIndex
CREATE INDEX "security_alerts_tenant_id_organization_id_idx" ON "security_alerts"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "generated_reports_organization_id_idx" ON "generated_reports"("organization_id");

-- CreateIndex
CREATE INDEX "generated_reports_category_idx" ON "generated_reports"("category");

-- CreateIndex
CREATE INDEX "generated_reports_created_at_idx" ON "generated_reports"("created_at");

-- CreateIndex
CREATE INDEX "generated_reports_tenant_id_organization_id_idx" ON "generated_reports"("tenant_id", "organization_id");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_status_idx" ON "bugs"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_reported_by_idx" ON "bugs"("tenant_id", "organization_id", "reported_by");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_assigned_to_idx" ON "bugs"("tenant_id", "organization_id", "assigned_to");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_created_at_idx" ON "bugs"("tenant_id", "organization_id", "created_at");

-- CreateIndex
CREATE INDEX "bug_attachments_tenant_id_bug_id_idx" ON "bug_attachments"("tenant_id", "bug_id");

-- CreateIndex
CREATE INDEX "bug_comments_tenant_id_bug_id_created_at_idx" ON "bug_comments"("tenant_id", "bug_id", "created_at");

-- CreateIndex
CREATE INDEX "bug_activity_log_tenant_id_bug_id_created_at_idx" ON "bug_activity_log"("tenant_id", "bug_id", "created_at");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_categories" ADD CONSTRAINT "work_categories_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_category_id_fkey" FOREIGN KEY ("work_category_id") REFERENCES "work_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_entries" ADD CONSTRAINT "scrum_entries_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_entries" ADD CONSTRAINT "scrum_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_entries" ADD CONSTRAINT "scrum_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_entries" ADD CONSTRAINT "scrum_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_tasks" ADD CONSTRAINT "scrum_tasks_scrum_entry_id_fkey" FOREIGN KEY ("scrum_entry_id") REFERENCES "scrum_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_tasks" ADD CONSTRAINT "scrum_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_tasks" ADD CONSTRAINT "scrum_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_tasks" ADD CONSTRAINT "scrum_tasks_kpi_template_id_fkey" FOREIGN KEY ("kpi_template_id") REFERENCES "kpi_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_edit_requests" ADD CONSTRAINT "scrum_edit_requests_scrum_entry_id_fkey" FOREIGN KEY ("scrum_entry_id") REFERENCES "scrum_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_edit_requests" ADD CONSTRAINT "scrum_edit_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_edit_requests" ADD CONSTRAINT "scrum_edit_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_blockers" ADD CONSTRAINT "scrum_blockers_scrum_entry_id_fkey" FOREIGN KEY ("scrum_entry_id") REFERENCES "scrum_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_issues" ADD CONSTRAINT "recurring_issues_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_issues" ADD CONSTRAINT "recurring_issues_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_issues" ADD CONSTRAINT "recurring_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_supervisor_override_id_fkey" FOREIGN KEY ("supervisor_override_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_shift_configuration_id_fkey" FOREIGN KEY ("shift_configuration_id") REFERENCES "shift_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_configurations" ADD CONSTRAINT "shift_configurations_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_limit_violations" ADD CONSTRAINT "shift_limit_violations_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_limit_violations" ADD CONSTRAINT "shift_limit_violations_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_limit_violations" ADD CONSTRAINT "shift_limit_violations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_limit_violations" ADD CONSTRAINT "shift_limit_violations_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_limit_violations" ADD CONSTRAINT "shift_limit_violations_shift_configuration_id_fkey" FOREIGN KEY ("shift_configuration_id") REFERENCES "shift_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_scrum_task_id_fkey" FOREIGN KEY ("scrum_task_id") REFERENCES "scrum_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_progress" ADD CONSTRAINT "kpi_progress_kpi_template_id_fkey" FOREIGN KEY ("kpi_template_id") REFERENCES "kpi_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_progress" ADD CONSTRAINT "kpi_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bir_tax_brackets" ADD CONSTRAINT "bir_tax_brackets_bir_tax_table_id_fkey" FOREIGN KEY ("bir_tax_table_id") REFERENCES "bir_tax_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_reports" ADD CONSTRAINT "payroll_reports_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_payroll_report_id_fkey" FOREIGN KEY ("payroll_report_id") REFERENCES "payroll_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_audit" ADD CONSTRAINT "ai_audit_ai_job_id_fkey" FOREIGN KEY ("ai_job_id") REFERENCES "ai_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_ai_job_id_fkey" FOREIGN KEY ("ai_job_id") REFERENCES "ai_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_alerts" ADD CONSTRAINT "security_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_comments" ADD CONSTRAINT "bug_comments_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_comments" ADD CONSTRAINT "bug_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_activity_log" ADD CONSTRAINT "bug_activity_log_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_activity_log" ADD CONSTRAINT "bug_activity_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

