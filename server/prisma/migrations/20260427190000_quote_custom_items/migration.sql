-- NTM-staff-added custom line items per quote.
ALTER TABLE "quotes"
  ADD COLUMN "customItems" JSONB NOT NULL DEFAULT '[]';
