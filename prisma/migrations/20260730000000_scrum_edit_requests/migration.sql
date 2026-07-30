-- CreateEnum
CREATE TYPE "ScrumEditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "scrum_edit_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scrum_entry_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ScrumEditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrum_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrum_edit_requests_tenant_id_scrum_entry_id_idx" ON "scrum_edit_requests"("tenant_id", "scrum_entry_id");

-- CreateIndex
CREATE INDEX "scrum_edit_requests_tenant_id_organization_id_status_idx" ON "scrum_edit_requests"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE INDEX "scrum_edit_requests_tenant_id_requester_id_idx" ON "scrum_edit_requests"("tenant_id", "requester_id");

-- AddForeignKey
ALTER TABLE "scrum_edit_requests" ADD CONSTRAINT "scrum_edit_requests_scrum_entry_id_fkey" FOREIGN KEY ("scrum_entry_id") REFERENCES "scrum_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_edit_requests" ADD CONSTRAINT "scrum_edit_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrum_edit_requests" ADD CONSTRAINT "scrum_edit_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

