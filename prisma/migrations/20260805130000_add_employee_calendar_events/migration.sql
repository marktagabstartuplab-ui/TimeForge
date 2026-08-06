-- BUG-AN: Add employee_calendar_events table for personal calendar events
-- (reminders, appointments, leave-request notes) on the "My Schedule" view.

CREATE TYPE "EmployeeCalendarEventType" AS ENUM ('REMINDER', 'APPOINTMENT', 'LEAVE_REQUEST');

CREATE TABLE "employee_calendar_events" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID        NOT NULL,
  "organization_id" UUID        NOT NULL,
  "user_id"         UUID        NOT NULL,
  "title"           TEXT        NOT NULL,
  "event_type"      "EmployeeCalendarEventType" NOT NULL DEFAULT 'REMINDER',
  "event_date"      TEXT        NOT NULL,
  "start_time"      TIMESTAMPTZ,
  "end_time"        TIMESTAMPTZ,
  "notes"           TEXT,
  "created_by"      UUID,
  "updated_by"      UUID,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"      TIMESTAMPTZ,
  "version"         INTEGER     NOT NULL DEFAULT 0,

  CONSTRAINT "employee_calendar_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_calendar_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "employee_calendar_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "employee_calendar_events_tenant_user_date_idx"
  ON "employee_calendar_events" ("tenant_id", "user_id", "event_date");

CREATE INDEX "employee_calendar_events_tenant_org_idx"
  ON "employee_calendar_events" ("tenant_id", "organization_id");
