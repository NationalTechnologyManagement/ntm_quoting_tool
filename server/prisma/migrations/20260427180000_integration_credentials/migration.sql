-- Editable integration credentials (DB-backed, override env at runtime).

CREATE TABLE "integration_credentials" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("key")
);
