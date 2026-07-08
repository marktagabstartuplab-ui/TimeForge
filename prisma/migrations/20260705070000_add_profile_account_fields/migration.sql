-- Profile & Account feature: avatar storage key, 2FA flag, last login timestamp.
ALTER TABLE "users" ADD COLUMN "avatar_key" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMPTZ;
