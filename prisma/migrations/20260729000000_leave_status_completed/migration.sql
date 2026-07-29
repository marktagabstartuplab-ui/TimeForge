-- Add terminal status for leave ended early via "Return to Work".
ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
