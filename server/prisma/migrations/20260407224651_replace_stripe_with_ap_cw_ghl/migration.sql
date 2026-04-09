/*
  Warnings:

  - You are about to drop the column `stripeCheckoutUrl` on the `quotes` table. All the data in the column will be lost.
  - You are about to drop the column `stripeSessionId` on the `quotes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "quotes" DROP COLUMN "stripeCheckoutUrl",
DROP COLUMN "stripeSessionId",
ADD COLUMN     "apCustomerId" TEXT,
ADD COLUMN     "apInvoiceId" TEXT,
ADD COLUMN     "apPaymentLink" TEXT,
ADD COLUMN     "cwAgreementId" INTEGER,
ADD COLUMN     "cwCompanyId" INTEGER,
ADD COLUMN     "cwContactId" INTEGER,
ADD COLUMN     "cwOpportunityId" INTEGER,
ADD COLUMN     "cwProjectId" INTEGER,
ADD COLUMN     "ghlContactId" TEXT,
ADD COLUMN     "ghlOpportunityId" TEXT;
