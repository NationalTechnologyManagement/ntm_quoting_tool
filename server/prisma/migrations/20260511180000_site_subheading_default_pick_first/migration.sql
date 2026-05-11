-- The quote builder flow reverted to "pick a package first, size on the next
-- step", so the subheading that asked the customer to type their user counts
-- before picking is no longer accurate. Update the default on the column AND
-- the existing singleton row, but only when the row still has the old default
-- text — admin customizations are preserved.

ALTER TABLE "site_content"
  ALTER COLUMN "quoteBuilderSubheading"
  SET DEFAULT 'Pick the plan that fits. We''ll size the quote to your team on the next step.';

UPDATE "site_content"
SET "quoteBuilderSubheading" = 'Pick the plan that fits. We''ll size the quote to your team on the next step.'
WHERE "id" = 'default'
  AND "quoteBuilderSubheading" = 'Tell us how many of each type of user you have, then pick the plan that fits. We''ll size the quote to your team.';
