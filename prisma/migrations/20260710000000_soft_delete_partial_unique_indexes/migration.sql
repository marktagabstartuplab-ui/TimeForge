-- Soft-delete + unique constraint fix.
--
-- Every table below combines a soft-delete column (deleted_at) with a unique
-- constraint that did NOT exclude soft-deleted rows. Concretely: soft-delete a
-- user/department/team/etc. and try to re-create one with the same natural
-- key (email, name, code, ...) — it fails on a unique violation, because the
-- old constraint enforced uniqueness across ALL rows, deleted or not.
--
-- Fix: replace each full unique index with a partial one (WHERE deleted_at IS
-- NULL) — uniqueness is now enforced only among *active* rows. Prisma's schema
-- DSL has no syntax for partial @@unique, so these constraints are no longer
-- modeled as @@unique in schema.prisma; they're plain @@index there for query
-- support, and this migration is the actual source of truth for the DB constraint.
--
-- Safe to run on existing data: the old (non-partial) constraints already
-- guaranteed there are no duplicate keys among active rows today, so creating
-- these new partial indexes cannot fail on existing data.
--
-- Two call sites (KpiProgress, OrganizationSetting) previously used Prisma's
-- native .upsert(), which compiles to `INSERT ... ON CONFLICT (cols) DO UPDATE`.
-- Postgres can't use a partial index as an implicit ON CONFLICT arbiter, so
-- those two were refactored to a manual find-then-branch (see
-- apps/api/src/modules/kpi/kpi.service.ts and
-- apps/api/src/modules/organization/organization.service.ts).

-- 1. organizations (tenant_id, slug)
DROP INDEX IF EXISTS "organizations_tenant_id_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_id_slug_key"
  ON "organizations"("tenant_id", "slug") WHERE "deleted_at" IS NULL;

-- 2. organization_settings (tenant_id, organization_id, key)
DROP INDEX IF EXISTS "organization_settings_tenant_id_organization_id_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "organization_settings_tenant_id_organization_id_key_key"
  ON "organization_settings"("tenant_id", "organization_id", "key") WHERE "deleted_at" IS NULL;

-- 3. users (tenant_id, email)
DROP INDEX IF EXISTS "users_tenant_id_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_id_email_key"
  ON "users"("tenant_id", "email") WHERE "deleted_at" IS NULL;

-- 4. roles (tenant_id, key)
DROP INDEX IF EXISTS "roles_tenant_id_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "roles_tenant_id_key_key"
  ON "roles"("tenant_id", "key") WHERE "deleted_at" IS NULL;

-- 5. departments (tenant_id, organization_id, name)
DROP INDEX IF EXISTS "departments_tenant_id_organization_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "departments_tenant_id_organization_id_name_key"
  ON "departments"("tenant_id", "organization_id", "name") WHERE "deleted_at" IS NULL;

-- 6. teams (tenant_id, organization_id, name)
DROP INDEX IF EXISTS "teams_tenant_id_organization_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "teams_tenant_id_organization_id_name_key"
  ON "teams"("tenant_id", "organization_id", "name") WHERE "deleted_at" IS NULL;

-- 7. clients (tenant_id, organization_id, name)
DROP INDEX IF EXISTS "clients_tenant_id_organization_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "clients_tenant_id_organization_id_name_key"
  ON "clients"("tenant_id", "organization_id", "name") WHERE "deleted_at" IS NULL;

-- 8. projects (tenant_id, organization_id, code)
DROP INDEX IF EXISTS "projects_tenant_id_organization_id_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "projects_tenant_id_organization_id_code_key"
  ON "projects"("tenant_id", "organization_id", "code") WHERE "deleted_at" IS NULL;

-- 9. work_categories (tenant_id, organization_id, name)
DROP INDEX IF EXISTS "work_categories_tenant_id_organization_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "work_categories_tenant_id_organization_id_name_key"
  ON "work_categories"("tenant_id", "organization_id", "name") WHERE "deleted_at" IS NULL;

-- 10. holidays (tenant_id, organization_id, date, name)
DROP INDEX IF EXISTS "holidays_tenant_id_organization_id_date_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "holidays_tenant_id_organization_id_date_name_key"
  ON "holidays"("tenant_id", "organization_id", "date", "name") WHERE "deleted_at" IS NULL;

-- 11. scrum_entries (tenant_id, user_id, entry_date)
DROP INDEX IF EXISTS "scrum_entries_tenant_id_user_id_entry_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "scrum_entries_tenant_id_user_id_entry_date_key"
  ON "scrum_entries"("tenant_id", "user_id", "entry_date") WHERE "deleted_at" IS NULL;

-- 12. kpi_templates (tenant_id, organization_id, name)
DROP INDEX IF EXISTS "kpi_templates_tenant_id_organization_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_templates_tenant_id_organization_id_name_key"
  ON "kpi_templates"("tenant_id", "organization_id", "name") WHERE "deleted_at" IS NULL;

-- 13. kpi_progress (tenant_id, kpi_template_id, user_id, period_key)
DROP INDEX IF EXISTS "kpi_progress_tenant_id_kpi_template_id_user_id_period_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_progress_tenant_id_kpi_template_id_user_id_period_key_key"
  ON "kpi_progress"("tenant_id", "kpi_template_id", "user_id", "period_key") WHERE "deleted_at" IS NULL;

-- 14. payroll_periods (tenant_id, organization_id, start_date, end_date)
DROP INDEX IF EXISTS "payroll_periods_tenant_id_organization_id_start_date_end_da_key";
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_tenant_id_organization_id_start_date_end_da_key"
  ON "payroll_periods"("tenant_id", "organization_id", "start_date", "end_date") WHERE "deleted_at" IS NULL;
