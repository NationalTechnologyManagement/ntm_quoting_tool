-- Track when the 30-day follow-up nudge was emailed. Null until sent.
-- The cron worker uses an index scan on this column + createdAt + status
-- to find unpaid quotes >=30 days old that haven't been nudged yet.

ALTER TABLE "quotes"
  ADD COLUMN "followupSentAt" TIMESTAMP(3);

CREATE INDEX "quotes_followupSentAt_idx" ON "quotes"("followupSentAt");
