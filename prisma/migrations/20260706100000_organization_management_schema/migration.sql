-- Organizational Management module: department manager assignment + project-department linkage/status.

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAYED');

-- AlterTable
ALTER TABLE "departments" ADD COLUMN "manager_id" UUID;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "department_id" UUID;
ALTER TABLE "projects" ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'ON_TRACK';

-- CreateIndex
CREATE INDEX "projects_tenant_id_organization_id_department_id_idx" ON "projects"("tenant_id", "organization_id", "department_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
