-- BUG-BX follow-up: the cumulative daily cap gets its own setting.
--
-- It had been sharing max_shift_minutes, which bounds one continuous session.
-- Reusing that for the day meant an org could not say "a shift may run 12
-- hours, but only 8 hours a day are payable" — moving one moved both.
--
-- Nullable, and the application falls back to max_shift_minutes when it is
-- null, so an organization that never sets it behaves exactly as before.
ALTER TABLE "shift_configurations" ADD COLUMN "max_daily_minutes" INTEGER;

-- Backfill every existing organization to the 8-hour policy this feature was
-- specified against. Orgs needing a different daily cap can be updated through
-- PATCH /shift-limits/config afterwards.
UPDATE "shift_configurations" SET "max_daily_minutes" = 480 WHERE "deleted_at" IS NULL;
