-- Add real file-attachment support, task field, and per-entry department override to time_entries.

-- attachments (JSON blob: key, filename, contentType, size)
ALTER TABLE "time_entries" ADD COLUMN "attachments" JSON;

-- task (free-text, stored separately from description)
ALTER TABLE "time_entries" ADD COLUMN "task" TEXT;

-- department_id (optional FK — overrides user's profile department)
ALTER TABLE "time_entries" ADD COLUMN "department_id" UUID;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "time_entries_tenant_id_department_id_idx" ON "time_entries"("tenant_id", "department_id");
