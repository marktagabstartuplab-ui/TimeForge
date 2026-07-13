-- Time Tracking: dedicated Deliverables field (kept separate from `description`).

ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "deliverables" TEXT;
