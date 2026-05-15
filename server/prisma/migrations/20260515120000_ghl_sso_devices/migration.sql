-- GHL embed SSO: per-device enrollment.
--
-- Adds admin_sso_devices (one row per enrolled browser; cookie carries a
-- signed reference to row.id) and tags admin_email_login_codes with a
-- purpose so codes issued by the 2FA flow can't be redeemed by the SSO
-- enrollment flow and vice versa.

-- ── EmailLoginCode.purpose ──────────────────────────────────────────
ALTER TABLE "admin_email_login_codes"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT '2fa';

-- Backfill is implicit via the column default — every existing row was
-- issued for the 2FA flow.

-- ── SsoDevice ───────────────────────────────────────────────────────
CREATE TABLE "admin_sso_devices" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userAgent" TEXT,
  "enrolledIp" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sso_devices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_sso_devices_userId_idx" ON "admin_sso_devices"("userId");
CREATE INDEX "admin_sso_devices_expiresAt_idx" ON "admin_sso_devices"("expiresAt");

ALTER TABLE "admin_sso_devices"
  ADD CONSTRAINT "admin_sso_devices_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
