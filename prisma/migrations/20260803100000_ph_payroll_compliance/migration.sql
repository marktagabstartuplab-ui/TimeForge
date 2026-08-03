-- FEAT-3: Enhanced Payroll — 2026 Philippine statutory compliance.
--
-- Adds per-org contribution settings, the national BIR withholding table, a
-- holiday classification, and the full earnings/deductions breakdown on payroll
-- line items. Every added column is nullable-or-defaulted so existing rows and
-- the pre-FEAT-3 code paths keep working unchanged.

-- CreateEnum
CREATE TYPE "holiday_type" AS ENUM ('REGULAR', 'SPECIAL_NON_WORKING');

-- AlterTable
ALTER TABLE "holidays" ADD COLUMN "type" "holiday_type" NOT NULL DEFAULT 'REGULAR';

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

-- AlterTable
ALTER TABLE "payroll_line_items"
    ADD COLUMN "holiday_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "night_diff_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "regular_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "overtime_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "night_differential" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "holiday_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "sss_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "philhealth_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "pagibig_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "income_tax_withheld" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "sss_employer_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "philhealth_employer_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "pagibig_employer_share" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "gross_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "net_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "ytd_taxable_income" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "ytd_tax_withheld" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "is_thirteenth_month" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_tenant_id_organization_id_key" ON "payroll_settings"("tenant_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "bir_tax_tables_tax_year_key" ON "bir_tax_tables"("tax_year");

-- CreateIndex
CREATE INDEX "bir_tax_tables_tax_year_is_active_idx" ON "bir_tax_tables"("tax_year", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "bir_tax_brackets_bir_tax_table_id_sequence_key" ON "bir_tax_brackets"("bir_tax_table_id", "sequence");

-- CreateIndex
CREATE INDEX "bir_tax_brackets_bir_tax_table_id_min_income_idx" ON "bir_tax_brackets"("bir_tax_table_id", "min_income");

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bir_tax_brackets" ADD CONSTRAINT "bir_tax_brackets_bir_tax_table_id_fkey" FOREIGN KEY ("bir_tax_table_id") REFERENCES "bir_tax_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: 2026 BIR annual withholding schedule (TRAIN Act, RA 10963 — the
-- schedule in force from 2023 onward and unchanged for 2026).
INSERT INTO "bir_tax_tables" ("id", "tax_year", "description", "is_active", "effective_date", "created_at", "updated_at")
VALUES (
    '5b5c6f1a-0000-4000-8000-000000002026',
    2026,
    'BIR annual withholding tax schedule (TRAIN Act, RA 10963) — effective 2023 onward',
    true,
    DATE '2026-01-01',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("tax_year") DO NOTHING;

INSERT INTO "bir_tax_brackets" ("id", "bir_tax_table_id", "sequence", "min_income", "max_income", "base_tax", "rate", "created_at")
SELECT gen_random_uuid(), t."id", v."sequence", v."min_income", v."max_income", v."base_tax", v."rate", CURRENT_TIMESTAMP
FROM "bir_tax_tables" t
CROSS JOIN (VALUES
    (1,       0.00,   250000.00,       0.00, 0.00),
    (2,  250000.00,   400000.00,       0.00, 0.15),
    (3,  400000.00,   800000.00,   22500.00, 0.20),
    (4,  800000.00,  2000000.00,  102500.00, 0.25),
    (5, 2000000.00,  8000000.00,  402500.00, 0.30),
    (6, 8000000.00,       NULL, 2202500.00, 0.35)
) AS v("sequence", "min_income", "max_income", "base_tax", "rate")
WHERE t."tax_year" = 2026
ON CONFLICT ("bir_tax_table_id", "sequence") DO NOTHING;

-- Backfill: give every existing organization the 2026 default settings row.
INSERT INTO "payroll_settings" ("id", "tenant_id", "organization_id", "created_at", "updated_at")
SELECT gen_random_uuid(), o."tenant_id", o."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."deleted_at" IS NULL
ON CONFLICT ("tenant_id", "organization_id") DO NOTHING;

-- Backfill: existing line items predate the breakdown. Their gross is the
-- already-computed estimated_pay; deductions stay zero because they were never
-- withheld for those closed periods. Re-generating an OPEN/GENERATED period
-- recomputes everything properly.
UPDATE "payroll_line_items"
SET "gross_total" = "estimated_pay",
    "net_pay" = "estimated_pay",
    "regular_pay" = "estimated_pay"
WHERE "gross_total" = 0;

-- Rollback (Prisma migrations are forward-only; run this by hand to revert):
--   ALTER TABLE "payroll_line_items"
--     DROP COLUMN "holiday_hours", DROP COLUMN "night_diff_hours",
--     DROP COLUMN "regular_pay", DROP COLUMN "overtime_pay",
--     DROP COLUMN "night_differential", DROP COLUMN "holiday_pay",
--     DROP COLUMN "sss_contribution", DROP COLUMN "philhealth_contribution",
--     DROP COLUMN "pagibig_contribution", DROP COLUMN "income_tax_withheld",
--     DROP COLUMN "sss_employer_share", DROP COLUMN "philhealth_employer_share",
--     DROP COLUMN "pagibig_employer_share", DROP COLUMN "gross_total",
--     DROP COLUMN "total_deductions", DROP COLUMN "net_pay",
--     DROP COLUMN "ytd_taxable_income", DROP COLUMN "ytd_tax_withheld",
--     DROP COLUMN "is_thirteenth_month";
--   ALTER TABLE "holidays" DROP COLUMN "type";
--   DROP TABLE "bir_tax_brackets"; DROP TABLE "bir_tax_tables";
--   DROP TABLE "payroll_settings"; DROP TYPE "holiday_type";
