-- CreateEnum
CREATE TYPE "bug_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "bug_priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "bug_severity" AS ENUM ('P0', 'P1', 'P2', 'P3', 'P4');

-- CreateTable
CREATE TABLE "bugs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "issue" TEXT NOT NULL,
    "who_affected" TEXT NOT NULL,
    "what_i_see" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "error_message" TEXT,
    "where_it_happens" VARCHAR(255) NOT NULL,
    "status" "bug_status" NOT NULL DEFAULT 'OPEN',
    "priority" "bug_priority" NOT NULL DEFAULT 'MEDIUM',
    "severity" "bug_severity" NOT NULL DEFAULT 'P3',
    "reported_by" UUID NOT NULL,
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bug_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(255),
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bug_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_activity_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bug_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "old_value" VARCHAR(255),
    "new_value" VARCHAR(255),
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_status_idx" ON "bugs"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_reported_by_idx" ON "bugs"("tenant_id", "organization_id", "reported_by");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_assigned_to_idx" ON "bugs"("tenant_id", "organization_id", "assigned_to");

-- CreateIndex
CREATE INDEX "bugs_tenant_id_organization_id_created_at_idx" ON "bugs"("tenant_id", "organization_id", "created_at");

-- CreateIndex
CREATE INDEX "bug_attachments_tenant_id_bug_id_idx" ON "bug_attachments"("tenant_id", "bug_id");

-- CreateIndex
CREATE INDEX "bug_comments_tenant_id_bug_id_created_at_idx" ON "bug_comments"("tenant_id", "bug_id", "created_at");

-- CreateIndex
CREATE INDEX "bug_activity_log_tenant_id_bug_id_created_at_idx" ON "bug_activity_log"("tenant_id", "bug_id", "created_at");

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_comments" ADD CONSTRAINT "bug_comments_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_comments" ADD CONSTRAINT "bug_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_activity_log" ADD CONSTRAINT "bug_activity_log_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_activity_log" ADD CONSTRAINT "bug_activity_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
