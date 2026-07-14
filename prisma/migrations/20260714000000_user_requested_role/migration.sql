-- Requested role captured at self-registration (EMPLOYEE | INTERN).
-- Nullable: existing users and admin-created users have no requested role.
ALTER TABLE "users" ADD COLUMN "requested_role" TEXT;
