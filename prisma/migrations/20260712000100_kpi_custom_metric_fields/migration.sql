-- KPI Management: flexible custom metric support.
-- Existing COUNT/HOURS/PERCENT/CURRENCY templates are untouched — the new
-- columns are nullable and only meaningful when metric_type = 'CUSTOM'.

ALTER TYPE "KpiMetricType" ADD VALUE IF NOT EXISTS 'CUSTOM';

ALTER TABLE "kpi_templates" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "kpi_templates" ADD COLUMN IF NOT EXISTS "formula" TEXT;
ALTER TABLE "kpi_templates" ADD COLUMN IF NOT EXISTS "validation_rules" JSONB;
ALTER TABLE "kpi_templates" ADD COLUMN IF NOT EXISTS "display_format" TEXT;
