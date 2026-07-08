-- New notification types for scrum/administration triggers + announcements.
ALTER TYPE "notification_type" ADD VALUE 'REJECTION';
ALTER TYPE "notification_type" ADD VALUE 'SCRUM_TASK_COMPLETED';
ALTER TYPE "notification_type" ADD VALUE 'SCRUM_ENTRY_LOCKED';
ALTER TYPE "notification_type" ADD VALUE 'SCRUM_BLOCKER_ADDED';
ALTER TYPE "notification_type" ADD VALUE 'DEPARTMENT_CHANGED';
ALTER TYPE "notification_type" ADD VALUE 'ROLE_CHANGED';
ALTER TYPE "notification_type" ADD VALUE 'ANNOUNCEMENT';
