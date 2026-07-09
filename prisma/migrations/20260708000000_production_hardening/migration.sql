-- Production Hardening: PENDING status, reference_links, token fields, index cleanup.

-- 1. Add PENDING to UserStatus enum (schema has it, migration missed it)
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'INVITED';

-- 2. Add reference_links to time_entries (defined in schema but never migrated)
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "reference_links" JSONB;

-- 3. Add email verification and password reset token fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_expires_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMPTZ;

-- 4. Add tenantId+organizationId composite indexes for org-scoped queries
CREATE INDEX IF NOT EXISTS "security_logs_tenant_id_organization_id_idx"
  ON "security_logs"("tenant_id", "organization_id");
CREATE INDEX IF NOT EXISTS "security_alerts_tenant_id_organization_id_idx"
  ON "security_alerts"("tenant_id", "organization_id");
CREATE INDEX IF NOT EXISTS "generated_reports_tenant_id_organization_id_idx"
  ON "generated_reports"("tenant_id", "organization_id");
CREATE INDEX IF NOT EXISTS "payroll_reports_tenant_id_organization_id_idx"
  ON "payroll_reports"("tenant_id", "organization_id");
CREATE INDEX IF NOT EXISTS "payroll_line_items_tenant_id_organization_id_idx"
  ON "payroll_line_items"("tenant_id", "organization_id");
