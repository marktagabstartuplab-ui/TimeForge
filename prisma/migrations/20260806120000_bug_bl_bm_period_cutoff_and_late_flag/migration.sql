-- BUG-BL / BUG-BM
--
-- BUG-BM (1): every payroll period gets a submission cutoff. Timesheets
-- submitted after it are still accepted, but flagged as late.
-- BUG-BM (2): `timesheets.is_late_submission` carries that flag.

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "is_late_submission" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payroll_periods" ADD COLUMN     "cutoff_date" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "timesheets_tenant_id_organization_id_is_late_submission_idx" ON "timesheets"("tenant_id", "organization_id", "is_late_submission");

-- Backfill: existing periods predate the column, so give them the same default
-- the application applies to new ones — end of the day AFTER end_date, i.e. a
-- one-day grace. Without this, every historical period has a NULL cutoff and no
-- submission against it could ever be classified.
UPDATE "payroll_periods"
   SET "cutoff_date" = ("end_date" + INTERVAL '2 days' - INTERVAL '1 millisecond')
 WHERE "cutoff_date" IS NULL;
