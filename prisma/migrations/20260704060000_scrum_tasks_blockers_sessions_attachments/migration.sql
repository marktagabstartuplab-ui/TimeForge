-- Daily Scrum tasks/blockers, Session Tracking (WorkSession/SessionEvent/SessionAttachment),
-- and employee-approval (REJECTED status) support. Additive only — no drops, no data migration.

-- CreateEnum
CREATE TYPE "ScrumTaskItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScrumTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "BlockerSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SessionEventType" AS ENUM ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'TASK_COMPLETED', 'CLOCK_OUT');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('GITHUB', 'FIGMA', 'PR', 'GOOGLE_DOCS', 'OTHER_LINK', 'FILE');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'EMPLOYEE_APPROVAL_REQUEST';

-- AlterTable
ALTER TABLE "scrum_entries" ADD COLUMN     "client_id" UUID,
ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kpi" TEXT,
ADD COLUMN     "planned_target" TEXT,
ADD COLUMN     "project_id" UUID,
ADD COLUMN     "submitted_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "work_session_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "rejected_at" TIMESTAMPTZ,
ADD COLUMN     "rejection_reason" TEXT;

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
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrum_tasks_pkey" PRIMARY KEY ("id")
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "scrum_tasks_tenant_id_scrum_entry_id_idx" ON "scrum_tasks"("tenant_id", "scrum_entry_id");

-- CreateIndex
CREATE INDEX "scrum_tasks_tenant_id_employee_id_idx" ON "scrum_tasks"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "scrum_blockers_tenant_id_scrum_entry_id_idx" ON "scrum_blockers"("tenant_id", "scrum_entry_id");

-- CreateIndex
CREATE INDEX "work_sessions_tenant_id_user_id_work_date_idx" ON "work_sessions"("tenant_id", "user_id", "work_date");

-- CreateIndex — enforces "only one active session per user" (Session Tracking requirement).
CREATE UNIQUE INDEX "work_sessions_one_active_per_user" ON "work_sessions"("user_id") WHERE "is_active" = true;

-- CreateIndex
CREATE INDEX "session_events_tenant_id_work_session_id_occurred_at_idx" ON "session_events"("tenant_id", "work_session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "session_events_tenant_id_user_id_occurred_at_idx" ON "session_events"("tenant_id", "user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "session_attachments_tenant_id_work_session_id_idx" ON "session_attachments"("tenant_id", "work_session_id");

-- CreateIndex
CREATE INDEX "session_attachments_tenant_id_scrum_task_id_idx" ON "session_attachments"("tenant_id", "scrum_task_id");

-- CreateIndex
CREATE INDEX "time_entries_work_session_id_idx" ON "time_entries"("work_session_id");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "scrum_blockers" ADD CONSTRAINT "scrum_blockers_scrum_entry_id_fkey" FOREIGN KEY ("scrum_entry_id") REFERENCES "scrum_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_scrum_task_id_fkey" FOREIGN KEY ("scrum_task_id") REFERENCES "scrum_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
