-- Rollback for 20260802000000_add_bug_tracking.
-- Prisma Migrate does not run down migrations automatically; apply manually with
--   psql "$DIRECT_URL" -f prisma/migrations/20260802000000_add_bug_tracking/down.sql
-- and then delete the corresponding row from _prisma_migrations.

DROP TABLE IF EXISTS "bug_activity_log";
DROP TABLE IF EXISTS "bug_comments";
DROP TABLE IF EXISTS "bug_attachments";
DROP TABLE IF EXISTS "bugs";

DROP TYPE IF EXISTS "bug_severity";
DROP TYPE IF EXISTS "bug_priority";
DROP TYPE IF EXISTS "bug_status";
