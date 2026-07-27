-- Supervisor-initiated time adjustments (BUG-Q).
--
-- A dedicated audit action so the trail can always tell "supervisor overrode
-- someone else's entry" apart from the ADMIN_ACTION rows an employee's own
-- time-entry edits write.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ADJUSTMENT';

-- The employee is always told their own record was changed.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TIME_ADJUSTED';

-- Explicit overtime set by a supervisor during review. NULL (the value every
-- existing row gets) means overtime keeps being derived from the entries
-- themselves at >8h/day, so nothing about existing timesheets changes.
ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "overtime_minutes_override" INTEGER;
