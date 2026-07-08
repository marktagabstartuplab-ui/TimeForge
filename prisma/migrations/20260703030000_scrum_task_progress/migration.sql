-- Add self-reported task progress + status to scrum entries (additive only).
CREATE TYPE "ScrumTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

ALTER TABLE "scrum_entries" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "scrum_entries" ADD COLUMN "status" "ScrumTaskStatus" NOT NULL DEFAULT 'NOT_STARTED';
