-- Adds amendment linking: an amendment quote points back at the original
-- via parent_quote_id. Used when an admin edits a quote that is already
-- paid — we leave the original alone (preserves audit trail / signed
-- contract) and clone a new quote for the delta with a fresh AP invoice.
ALTER TABLE "quotes" ADD COLUMN "parentQuoteId" TEXT;
CREATE INDEX "quotes_parentQuoteId_idx" ON "quotes" ("parentQuoteId");
