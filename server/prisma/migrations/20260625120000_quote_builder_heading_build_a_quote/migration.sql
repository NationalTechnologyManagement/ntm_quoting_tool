-- The package picker was reframed as "Build a quote" — sizing + live pricing
-- now happen right after picking a package, so the heading/subheading copy
-- changes to match. Update the default on the columns AND the existing
-- singleton row, but only when the row still has the previous default text so
-- any admin customization is preserved.

ALTER TABLE "site_content"
  ALTER COLUMN "quoteBuilderHeading"
  SET DEFAULT 'Build a quote';

ALTER TABLE "site_content"
  ALTER COLUMN "quoteBuilderSubheading"
  SET DEFAULT 'Build your quote and see exact pricing — tax and fees included.';

UPDATE "site_content"
SET "quoteBuilderHeading" = 'Build a quote'
WHERE "id" = 'default'
  AND "quoteBuilderHeading" = 'Choose Your Package';

UPDATE "site_content"
SET "quoteBuilderSubheading" = 'Build your quote and see exact pricing — tax and fees included.'
WHERE "id" = 'default'
  AND "quoteBuilderSubheading" = 'Pick the plan that fits. We''ll size the quote to your team on the next step.';
