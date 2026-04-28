import { prisma } from '../config/prisma.js';

// Step names — keep in sync with the orchestrator in connectwise.service.ts.
// The (quoteId, step) unique constraint is what makes retries idempotent.
export const CW_STEPS = [
  'company',          // POST /company/companies (or find existing)
  'site',             // PATCH site for tax code if applicable
  'contact',          // POST /company/contacts (primary)
  'billingContact',   // POST /company/contacts (billing, if different)
  'opportunity',      // POST /sales/opportunities
  'agreement',        // POST /finance/agreements (status=New)
  'additions',        // POST /finance/agreements/{id}/additions per addon
  'activate',         // PATCH /finance/agreements/{id} status=Active
  'project',          // POST /project/projects (uses templateId)
  'crossref',         // PATCH custom fields on company/agreement/project
  'handoff',          // notify + status flip
] as const;

export type CwStep = (typeof CW_STEPS)[number];
export type CwStepStatus = 'pending' | 'success' | 'failed' | 'skipped';

export async function getStep(quoteId: string, step: CwStep) {
  return prisma.cwProvisioningStep.findUnique({
    where: { quoteId_step: { quoteId, step } },
  });
}

export async function getAllSteps(quoteId: string) {
  return prisma.cwProvisioningStep.findMany({
    where: { quoteId },
    orderBy: { updatedAt: 'asc' },
  });
}

export async function recordStep(
  quoteId: string,
  step: CwStep,
  status: CwStepStatus,
  cwId: number | null = null,
  lastError: string | null = null,
) {
  return prisma.cwProvisioningStep.upsert({
    where: { quoteId_step: { quoteId, step } },
    update: {
      status,
      cwId: cwId ?? undefined,
      lastError,
      attempts: { increment: status === 'failed' ? 1 : 0 },
    },
    create: {
      quoteId,
      step,
      status,
      cwId,
      lastError,
      attempts: status === 'failed' ? 1 : 0,
      startedAt: new Date(),
    },
  });
}

export async function markStarted(quoteId: string, step: CwStep) {
  return prisma.cwProvisioningStep.upsert({
    where: { quoteId_step: { quoteId, step } },
    update: { status: 'pending', startedAt: new Date() },
    create: { quoteId, step, status: 'pending', startedAt: new Date() },
  });
}

// Used by retry worker — finds quotes with at least one failed step that hasn't
// hit the cap, ordered by oldest first so backlogs drain in FIFO order.
export async function findQuotesNeedingRetry(maxAttempts: number, limit: number) {
  const failed = await prisma.cwProvisioningStep.findMany({
    where: { status: 'failed', attempts: { lt: maxAttempts } },
    distinct: ['quoteId'],
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { quoteId: true },
  });
  return failed.map((f) => f.quoteId);
}
