-- Daily Scrum: automatic recurring operational issue detection.
-- Runs alongside (not replacing) the existing per-employee recurring-blocker
-- flag in scrum.service.ts and the AI BLOCKER_DETECTION toggle.

CREATE TYPE "recurring_issue_category" AS ENUM ('BLOCKER', 'DELAY');
CREATE TYPE "recurring_issue_trend" AS ENUM ('INCREASING', 'STABLE', 'DECREASING');
CREATE TYPE "recurring_issue_status" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "recurring_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "category" "recurring_issue_category" NOT NULL,
  "issue_text" TEXT NOT NULL,
  "department_id" UUID,
  "project_id" UUID,
  "employee_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "first_occurrence" TIMESTAMPTZ NOT NULL,
  "last_occurrence" TIMESTAMPTZ NOT NULL,
  "trend" "recurring_issue_trend" NOT NULL DEFAULT 'STABLE',
  "suggested_action" TEXT,
  "status" "recurring_issue_status" NOT NULL DEFAULT 'OPEN',
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "recurring_issues_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "recurring_issues"
  ADD CONSTRAINT "recurring_issues_tenant_org_fkey"
  FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id");

ALTER TABLE "recurring_issues"
  ADD CONSTRAINT "recurring_issues_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recurring_issues"
  ADD CONSTRAINT "recurring_issues_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "recurring_issues_tenant_id_organization_id_status_idx"
  ON "recurring_issues"("tenant_id", "organization_id", "status");
CREATE INDEX "recurring_issues_tenant_id_organization_id_department_id_idx"
  ON "recurring_issues"("tenant_id", "organization_id", "department_id");
CREATE INDEX "recurring_issues_tenant_id_organization_id_project_id_idx"
  ON "recurring_issues"("tenant_id", "organization_id", "project_id");
CREATE INDEX "recurring_issues_tenant_id_organization_id_last_occurrence_idx"
  ON "recurring_issues"("tenant_id", "organization_id", "last_occurrence");
