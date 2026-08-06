-- CreateEnum
CREATE TYPE "CompensationType" AS ENUM ('HOURLY', 'DAILY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "compensation_type" "CompensationType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "daily_rate" DECIMAL(12,2),
ADD COLUMN     "days_per_week" DECIMAL(4,2) DEFAULT 5;

-- AlterTable
ALTER TABLE "payroll_line_items" ADD COLUMN     "compensation_type" "CompensationType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "daily_rate" DECIMAL(12,2),
ADD COLUMN     "days_per_week" DECIMAL(4,2) DEFAULT 5,
ADD COLUMN     "days_worked" DECIMAL(6,2) NOT NULL DEFAULT 0;

