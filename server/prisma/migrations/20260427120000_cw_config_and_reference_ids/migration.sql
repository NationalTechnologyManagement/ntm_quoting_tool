-- Phase 1: CW reference IDs as runtime config + per-row CW ids on Package/Addon.
-- Additive only. No drops, no NOT NULL on existing rows, no destructive changes.

-- Per-package agreement type id
ALTER TABLE "packages" ADD COLUMN "cwAgreementTypeId" INTEGER;

-- Per-addon catalog product id (CW Manage Addition.product is required on POST)
ALTER TABLE "addons" ADD COLUMN "cwProductId" INTEGER;

-- Key/value config store for CW reference data
CREATE TABLE "cw_config" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cw_config_pkey" PRIMARY KEY ("key")
);
