-- BUG-AR: employees can dismiss a supervisor comment from their active Daily
-- Scrum dashboard. The note itself is retained so the entry's history still
-- shows it; only the active-dashboard surfaces filter on this column.
ALTER TABLE "scrum_entries" ADD COLUMN "supervisor_note_dismissed_at" TIMESTAMPTZ;
