-- BUG-BV: Task Progress tracker for carry-over tasks.
-- Nullable on purpose: existing rows (and any task the employee never rates)
-- have no progress, which is not the same statement as 0%.
ALTER TABLE "scrum_tasks" ADD COLUMN "completion_percentage" INTEGER;
