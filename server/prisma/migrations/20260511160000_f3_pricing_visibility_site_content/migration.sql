-- F3 (Web User) per-user pricing + customer-visibility toggle on packages.
-- Plus a small SiteContent singleton table that holds the editable
-- customer-facing copy for the quote-builder page (heading/sub/explainer).

ALTER TABLE "packages"
  ADD COLUMN "pricePerUserF3" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "customerVisible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "site_content" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "quoteBuilderHeading" TEXT NOT NULL DEFAULT 'Choose Your Package',
  "quoteBuilderSubheading" TEXT NOT NULL DEFAULT 'Tell us how many of each type of user you have, then pick the plan that fits. We''ll size the quote to your team.',
  "quoteBuilderExplainerTitle" TEXT NOT NULL DEFAULT 'Desktop User vs Web User',
  "quoteBuilderExplainerBody" TEXT NOT NULL DEFAULT E'Desktop User — full Microsoft 365 Business Premium. Use this for your primary staff who need the full desktop apps, Teams calls, and offline access.\n\nWeb User — Microsoft 365 F3 (Web & Email Only). Use this for frontline, warehouse, kiosk, or shared-device employees who only need email and browser-based apps. Costs less per user.',
  "updatedAt" TIMESTAMP(3) NOT NULL
);

INSERT INTO "site_content" ("id", "updatedAt") VALUES ('default', NOW())
ON CONFLICT ("id") DO NOTHING;
