-- FEAT-2: Time Clock Shift Limits
-- Adds per-org shift configuration, shift-limit fields on work_sessions, and an
-- immutable violation audit trail.

-- CreateEnum
CREATE TYPE "shift_violation_type" AS ENUM ('REACHED_LIMIT', 'AUTO_CLOCKED_OUT', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "shift_supervisor_action" AS ENUM ('NO_ACTION', 'APPROVED', 'DENIED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'SHIFT_LIMIT_WARNING';
ALTER TYPE "notification_type" ADD VALUE 'SHIFT_AUTO_CLOCKED_OUT';
ALTER TYPE "notification_type" ADD VALUE 'SHIFT_OVERRIDE_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE 'SHIFT_OVERRIDE_DECISION';

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

-- AlterTable
ALTER TABLE "work_sessions"
    ADD COLUMN "shift_configuration_id" UUID,
    ADD COLUMN "max_clock_out_at" TIMESTAMPTZ,
    ADD COLUMN "is_auto_clocked_out" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "auto_clock_out_reason" TEXT,
    ADD COLUMN "requires_override" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "supervisor_override_id" UUID,
    ADD COLUMN "override_approved" BOOLEAN,
    ADD COLUMN "override_approved_at" TIMESTAMPTZ;

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

-- Backfill: give every existing organization a default 12-hour shift configuration.
INSERT INTO "shift_configurations" ("id", "tenant_id", "organization_id", "shift_name", "max_shift_minutes", "grace_period_minutes", "requires_supervisor_override", "warning_lead_minutes", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid(), o."tenant_id", o."id", 'Standard', 720, 0, true, 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."deleted_at" IS NULL;
