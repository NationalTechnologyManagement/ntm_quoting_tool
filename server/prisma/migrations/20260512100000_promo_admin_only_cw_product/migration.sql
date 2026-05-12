-- Admin-only promo codes (hidden from customer wizard / validate endpoint)
-- and optional CW catalog product id so postAdditions can post the discount
-- as a negative-priced Addition onto the agreement. Used initially for the
-- 5-year discount (PERUSER0004-MRR).

ALTER TABLE "promo_codes"
  ADD COLUMN "adminOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cwProductId" INTEGER;

-- Seed the 5-year discount promo. Admin sets the exact percentage and CW
-- product id from /admin/promo-codes after deploy; 15% is a sane starting
-- value. Idempotent: skipped if a row with this code already exists.
INSERT INTO "promo_codes" (
  "id", "code", "discount", "discountType", "applyTo", "active",
  "adminOnly", "cwProductId", "createdAt", "updatedAt"
)
SELECT
  'promo-5yr-discount',
  '5YR-DISCOUNT',
  15,
  'percentage',
  'monthly',
  true,
  true,
  NULL,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "promo_codes" WHERE "code" = '5YR-DISCOUNT'
);
