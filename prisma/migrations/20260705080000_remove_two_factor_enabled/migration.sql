-- Removed: 2FA toggle had no enforcement in the login flow (cosmetic-only, no TOTP enrollment).
ALTER TABLE "users" DROP COLUMN "two_factor_enabled";
