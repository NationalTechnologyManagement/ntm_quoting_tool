-- Wave 2: user invites, role-based access, 2FA, sales-rep assignment.
--
-- Adds role + 2FA columns to admin_users; introduces invite-token and
-- email-code tables; links quotes to a sales rep. The existing seeded
-- admin row keeps its passwordHash and is upgraded to role='admin' with
-- twoFactorMethod=null so the first login forces 2FA enrollment.

-- ── AdminUser extensions ────────────────────────────────────────────
ALTER TABLE "admin_users"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "twoFactorMethod" TEXT,
  ADD COLUMN "twoFactorSecret" TEXT,
  ADD COLUMN "recoveryCodesHash" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- ── Invite table ────────────────────────────────────────────────────
CREATE TABLE "admin_invites" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'sales_rep',
  "tokenHash" TEXT NOT NULL,
  "invitedById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_invites_tokenHash_key" ON "admin_invites"("tokenHash");
CREATE INDEX "admin_invites_email_idx" ON "admin_invites"("email");
ALTER TABLE "admin_invites"
  ADD CONSTRAINT "admin_invites_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Email login codes (for the 'email' 2FA variant) ────────────────
CREATE TABLE "admin_email_login_codes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_email_login_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_email_login_codes_userId_idx" ON "admin_email_login_codes"("userId");
ALTER TABLE "admin_email_login_codes"
  ADD CONSTRAINT "admin_email_login_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Quote.salesRepId ───────────────────────────────────────────────
ALTER TABLE "quotes" ADD COLUMN "salesRepId" TEXT;
CREATE INDEX "quotes_salesRepId_idx" ON "quotes"("salesRepId");
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_salesRepId_fkey"
  FOREIGN KEY ("salesRepId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
