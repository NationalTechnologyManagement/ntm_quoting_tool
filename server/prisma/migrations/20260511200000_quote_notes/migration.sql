-- Free-text notes field on quotes. Admin-edited, customer-visible. Catches
-- whatever the structured pricing fields don't (custom scope, hand-off
-- instructions, discount rationale, etc.).
ALTER TABLE "quotes" ADD COLUMN "notes" TEXT;
