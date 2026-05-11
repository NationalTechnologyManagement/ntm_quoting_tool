-- Per-package CW catalog product IDs. postAdditions uses these to post the
-- recurring per-user / per-location lines on the agreement so the agreement
-- carries the same SKUs CW uses to invoice month 2+.
ALTER TABLE "packages"
  ADD COLUMN "cwPerUserProductId" INTEGER,
  ADD COLUMN "cwPerUserF3ProductId" INTEGER,
  ADD COLUMN "cwPerLocationProductId" INTEGER;
