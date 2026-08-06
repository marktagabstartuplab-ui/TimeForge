-- BUG-BP: lock the daily plan once the employee saves it.
-- Distinct from is_locked (the whole-day lock that fires at 100% task
-- completion) — a plan-locked entry still accepts End of Day review results.
ALTER TABLE "scrum_entries" ADD COLUMN "plan_locked_at" TIMESTAMPTZ;
