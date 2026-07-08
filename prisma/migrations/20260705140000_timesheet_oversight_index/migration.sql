-- Supports org-wide Timesheet Oversight queries (status + date-range filtering
-- across the whole org, not scoped to a single user).

CREATE INDEX IF NOT EXISTS "timesheets_tenant_id_organization_id_status_period_start_idx"
  ON "timesheets" ("tenant_id", "organization_id", "status", "period_start");
