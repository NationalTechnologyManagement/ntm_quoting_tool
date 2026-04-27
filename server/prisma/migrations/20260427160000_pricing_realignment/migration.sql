-- Pricing realignment to NTM real catalog (per ntm-sales-kb-upload-only/).
-- Additive only: adds agreementMonths column. Seed handles row updates idempotently.

ALTER TABLE "packages" ADD COLUMN "agreementMonths" INTEGER NOT NULL DEFAULT 0;
