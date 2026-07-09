-- Leave Management: LeaveRequest + LeaveBalance.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'PERSONAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. leave_requests
CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "LeaveType" NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" DECIMAL(5,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ,
  "review_note" TEXT,
  "attachment_key" TEXT,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_tenant_org_fkey"
  FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id");

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "leave_requests_tenant_id_user_id_status_idx"
  ON "leave_requests"("tenant_id", "user_id", "status");
CREATE INDEX IF NOT EXISTS "leave_requests_tenant_id_organization_id_status_idx"
  ON "leave_requests"("tenant_id", "organization_id", "status");

-- 3. leave_balances
CREATE TABLE IF NOT EXISTS "leave_balances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "LeaveType" NOT NULL,
  "year" INTEGER NOT NULL,
  "allocated_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "used_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_balances"
  ADD CONSTRAINT "leave_balances_tenant_org_fkey"
  FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id");

ALTER TABLE "leave_balances"
  ADD CONSTRAINT "leave_balances_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

CREATE UNIQUE INDEX IF NOT EXISTS "leave_balances_tenant_id_user_id_type_year_key"
  ON "leave_balances"("tenant_id", "user_id", "type", "year");
