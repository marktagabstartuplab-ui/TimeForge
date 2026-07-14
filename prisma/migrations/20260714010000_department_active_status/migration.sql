-- Department-based supervision (Phase 1): Active Status on departments.
-- Existing departments default to active so behaviour is unchanged on deploy.
ALTER TABLE "departments" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
