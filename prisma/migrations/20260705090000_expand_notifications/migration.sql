-- Notification Center: expand notifications with category/priority/title/message/
-- action link, explicit read/archive tracking, sender + organization scoping.
-- Existing rows are backfilled so nothing is lost.

-- 1) New enum types
CREATE TYPE "notification_category" AS ENUM ('DAILY_SCRUM', 'TIMESHEETS', 'PAYROLL', 'ACCOUNT', 'SYSTEM', 'SCHEDULE', 'SECURITY', 'LEAVE', 'PERFORMANCE');
CREATE TYPE "notification_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- 2) New columns (nullable/defaulted first so existing rows aren't rejected)
ALTER TABLE "notifications" ADD COLUMN "organization_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "sender_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "category" "notification_category";
ALTER TABLE "notifications" ADD COLUMN "priority" "notification_priority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "notifications" ADD COLUMN "title" TEXT;
ALTER TABLE "notifications" ADD COLUMN "message" TEXT;
ALTER TABLE "notifications" ADD COLUMN "action_url" TEXT;
ALTER TABLE "notifications" ADD COLUMN "action_label" TEXT;
ALTER TABLE "notifications" ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN "read_at" TIMESTAMPTZ;
ALTER TABLE "notifications" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- 3) payload -> metadata (same jsonb column, existing data preserved)
ALTER TABLE "notifications" RENAME COLUMN "payload" TO "metadata";

-- 4) Backfill existing rows
UPDATE "notifications" n
SET "organization_id" = u."organization_id"
FROM "users" u
WHERE n."user_id" = u."id" AND n."organization_id" IS NULL;

UPDATE "notifications" SET "is_read" = true, "read_at" = "updated_at" WHERE "status" = 'READ';

UPDATE "notifications" SET "category" = CASE "type"
  WHEN 'APPROVAL_DECISION' THEN 'ACCOUNT'
  WHEN 'EMPLOYEE_APPROVAL_REQUEST' THEN 'ACCOUNT'
  WHEN 'SUBMISSION' THEN 'TIMESHEETS'
  WHEN 'REVISION_REQUEST' THEN 'TIMESHEETS'
  WHEN 'DEADLINE' THEN 'TIMESHEETS'
  WHEN 'PAYROLL_READY' THEN 'PAYROLL'
  WHEN 'AI_REPORT' THEN 'SYSTEM'
  ELSE 'SYSTEM'
END::"notification_category"
WHERE "category" IS NULL;

UPDATE "notifications" SET
  "title" = CASE "type"
    WHEN 'APPROVAL_DECISION' THEN 'Approval Decision'
    WHEN 'EMPLOYEE_APPROVAL_REQUEST' THEN 'New employee awaiting approval'
    WHEN 'SUBMISSION' THEN 'Timesheet Submitted'
    WHEN 'REVISION_REQUEST' THEN 'Revision Requested'
    WHEN 'DEADLINE' THEN 'Deadline Reminder'
    WHEN 'PAYROLL_READY' THEN 'Payslip Ready'
    WHEN 'AI_REPORT' THEN 'AI Report Ready'
    ELSE 'Notification'
  END,
  "message" = CASE "type"
    WHEN 'APPROVAL_DECISION' THEN 'A decision was made on your request.'
    WHEN 'EMPLOYEE_APPROVAL_REQUEST' THEN 'A new registration is awaiting approval.'
    WHEN 'SUBMISSION' THEN 'A timesheet was submitted for review.'
    WHEN 'REVISION_REQUEST' THEN 'A supervisor requested changes to your timesheet.'
    WHEN 'DEADLINE' THEN 'A submission deadline is approaching.'
    WHEN 'PAYROLL_READY' THEN 'Your latest payslip is ready to view.'
    WHEN 'AI_REPORT' THEN 'A generated report is ready to view.'
    ELSE ''
  END
WHERE "title" IS NULL;

-- 5) Now safe to enforce NOT NULL
ALTER TABLE "notifications" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "message" SET NOT NULL;

-- 6) Foreign key for sender
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) Reshape indexes to match new query patterns
DROP INDEX "notifications_tenant_id_user_id_status_created_at_idx";
DROP INDEX "notifications_tenant_id_user_id_type_idx";
CREATE INDEX "notifications_tenant_id_user_id_is_read_created_at_idx" ON "notifications" ("tenant_id", "user_id", "is_read", "created_at" DESC);
CREATE INDEX "notifications_tenant_id_user_id_category_idx" ON "notifications" ("tenant_id", "user_id", "category");
CREATE INDEX "notifications_tenant_id_organization_id_idx" ON "notifications" ("tenant_id", "organization_id");
