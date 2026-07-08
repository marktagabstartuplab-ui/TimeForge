-- Indexes to support the Daily Scrum Management dashboard's aggregate queries
-- (submission trends, late-submission detection, department/team rollups).

CREATE INDEX IF NOT EXISTS "scrum_entries_tenant_id_organization_id_submitted_at_idx"
  ON "scrum_entries" ("tenant_id", "organization_id", "submitted_at");

CREATE INDEX IF NOT EXISTS "users_tenant_id_team_id_idx"
  ON "users" ("tenant_id", "team_id");
