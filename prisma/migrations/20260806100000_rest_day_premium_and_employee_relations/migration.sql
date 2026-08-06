-- CreateEnum
CREATE TYPE "DisciplineStatus" AS ENUM ('ISSUED', 'RESPONDED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "rest_day_worked_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.30;

-- AlterTable
ALTER TABLE "payroll_line_items" ADD COLUMN     "rest_day_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rest_day_pay" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "discipline_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "issuer_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "violation_description" TEXT NOT NULL,
    "status" "DisciplineStatus" NOT NULL DEFAULT 'ISSUED',
    "employee_response" TEXT,
    "responded_at" TIMESTAMPTZ,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "discipline_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_checklists" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clearance_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_checklist_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "department" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clearance_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discipline_records_tenant_id_organization_id_status_idx" ON "discipline_records"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "discipline_records_tenant_id_employee_id_idx" ON "discipline_records"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "clearance_checklists_tenant_id_organization_id_status_idx" ON "clearance_checklists"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "clearance_checklists_tenant_id_employee_id_idx" ON "clearance_checklists"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "clearance_checklist_items_tenant_id_checklist_id_idx" ON "clearance_checklist_items"("tenant_id", "checklist_id");

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline_records" ADD CONSTRAINT "discipline_records_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_checklists" ADD CONSTRAINT "clearance_checklists_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_checklist_items" ADD CONSTRAINT "clearance_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "clearance_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

