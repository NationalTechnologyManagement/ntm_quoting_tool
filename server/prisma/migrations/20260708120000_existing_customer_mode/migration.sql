-- Existing-customer mode + fully-strippable quotes.
-- 1. selectedPackage becomes nullable so an admin can remove the package
--    entirely (quote add-ons / custom items only).
-- 2. isExistingCustomer flags quotes for companies that already live in
--    ConnectWise: provisioning adds onto the existing agreement instead of
--    creating a new one, and skips the onboarding project template.

ALTER TABLE "quotes" ALTER COLUMN "selectedPackage" DROP NOT NULL;
ALTER TABLE "quotes" ADD COLUMN "isExistingCustomer" BOOLEAN NOT NULL DEFAULT false;
