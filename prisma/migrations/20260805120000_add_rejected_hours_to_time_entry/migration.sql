-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "submitted_minutes" INTEGER,
ADD COLUMN     "approved_minutes" INTEGER,
ADD COLUMN     "rejected_minutes" INTEGER,
ADD COLUMN     "rejection_reason" TEXT;
