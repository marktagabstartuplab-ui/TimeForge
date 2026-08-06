-- BUG-BC: De Minimis Benefits tracker and the non-taxable payroll line it feeds.

-- CreateEnum
CREATE TYPE "DeMinimisType" AS ENUM ('RICE_SUBSIDY', 'CLOTHING_ALLOWANCE', 'LAUNDRY_ALLOWANCE', 'MEDICAL_ALLOWANCE', 'MEDICAL_CASH_ALLOWANCE_DEPENDENTS', 'MEAL_ALLOWANCE', 'OTHER');

-- AlterTable
ALTER TABLE "payroll_line_items" ADD COLUMN     "de_minimis_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "de_minimis_benefits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "benefit_type" "DeMinimisType" NOT NULL,
    "monthly_amount" DECIMAL(12,2) NOT NULL,
    "requested_amount" DECIMAL(12,2) NOT NULL,
    "bir_monthly_cap" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "de_minimis_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "de_minimis_benefits_tenant_id_organization_id_is_active_idx" ON "de_minimis_benefits"("tenant_id", "organization_id", "is_active");

-- CreateIndex
CREATE INDEX "de_minimis_benefits_tenant_id_employee_id_idx" ON "de_minimis_benefits"("tenant_id", "employee_id");

-- AddForeignKey
ALTER TABLE "de_minimis_benefits" ADD CONSTRAINT "de_minimis_benefits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
