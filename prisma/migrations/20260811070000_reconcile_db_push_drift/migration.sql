-- Reconciles migration history with the schema that production has been
-- running. These objects reached production through `prisma db push` and no
-- migration ever described them, so `migrate deploy` against an empty database
-- produced a schema missing a table, three enums, four columns and two index
-- names — a fresh environment silently diverged from production.
--
-- Generated with:
--   prisma migrate diff --from-migrations prisma/migrations
--                       --to-schema-datamodel prisma/schema.prisma --script
--
-- Production and every environment that already has these objects must record
-- this migration WITHOUT executing it:
--
--   npx prisma migrate resolve --applied 20260811070000_reconcile_db_push_drift
--
-- (Production was verified to match schema.prisma exactly before that was done:
-- `migrate diff --from-url <prod> --to-schema-datamodel` came back empty.)

-- CreateEnum
CREATE TYPE "TimesheetPaymentStatus" AS ENUM ('UNPAID', 'PROCESSING', 'PAID');

-- CreateEnum
CREATE TYPE "GrievanceCategory" AS ENUM ('WORKPLACE_ENVIRONMENT', 'COLLEAGUE_ISSUE', 'PAYROLL_DISPUTE', 'HARASSMENT', 'SAFETY_CONCERN', 'MANAGEMENT_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED');

-- AlterTable
ALTER TABLE "employee_calendar_events" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payroll_periods" ADD COLUMN     "is_auto_generated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "payment_status" "TimesheetPaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "payroll_period_id" UUID;

-- CreateTable
CREATE TABLE "grievances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "GrievanceCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "GrievanceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "internal_notes" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "grievances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grievances_tenant_id_organization_id_status_idx" ON "grievances"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "grievances_tenant_id_employee_id_idx" ON "grievances"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_periods_tenant_id_organization_id_is_auto_generated_idx" ON "payroll_periods"("tenant_id", "organization_id", "is_auto_generated");

-- CreateIndex
CREATE INDEX "timesheets_tenant_id_payroll_period_id_idx" ON "timesheets"("tenant_id", "payroll_period_id");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "employee_calendar_events_tenant_org_idx" RENAME TO "employee_calendar_events_tenant_id_organization_id_idx";

-- RenameIndex
ALTER INDEX "employee_calendar_events_tenant_user_date_idx" RENAME TO "employee_calendar_events_tenant_id_user_id_event_date_idx";

