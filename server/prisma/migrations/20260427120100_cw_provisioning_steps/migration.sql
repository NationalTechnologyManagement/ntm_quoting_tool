-- Phase 2 + Phase 4: per-step state tracking + per-quote provisioning status.
-- Additive only.

-- Per-step idempotency table for CW orchestration
CREATE TABLE "cw_provisioning_steps" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "cwId" INTEGER,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cw_provisioning_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cw_provisioning_steps_quoteId_step_key"
  ON "cw_provisioning_steps" ("quoteId", "step");

CREATE INDEX "cw_provisioning_steps_status_idx"
  ON "cw_provisioning_steps" ("status");

ALTER TABLE "cw_provisioning_steps"
  ADD CONSTRAINT "cw_provisioning_steps_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "quotes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-quote rollup status used by webhooks and the admin UI
ALTER TABLE "quotes"
  ADD COLUMN "provisioningStatus" TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX "quotes_provisioningStatus_idx"
  ON "quotes" ("provisioningStatus");
