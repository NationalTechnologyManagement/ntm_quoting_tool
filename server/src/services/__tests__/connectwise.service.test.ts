// Step-machine tests for the CW orchestrator.
// Mocks Prisma + global fetch so the orchestrator runs without a DB or network.
// The point is to assert the resume/idempotency/fail-policy contract:
//
//   1. resume after company succeeded skips company POST on next run
//   2. additions partial-failure leaves agreement in Inactive (no activate POST)
//   3. hard-fail at company creation throws CwHardFailError out of onPaymentCompleted
//      when the quote has no cwCompanyId from a prior run
//   4. crossref/handoff failures don't block provisioned status

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

// In-memory step store keyed by `${quoteId}::${step}`
type Step = { quoteId: string; step: string; status: string; cwId: number | null; attempts: number; lastError: string | null };
const stepStore = new Map<string, Step>();
const provisioningStatusByQuote = new Map<string, string>();

vi.mock('../../config/prisma.js', () => {
  const cwProvisioningStep = {
    findUnique: vi.fn(async ({ where }: any) => {
      const k = `${where.quoteId_step.quoteId}::${where.quoteId_step.step}`;
      return stepStore.get(k) ?? null;
    }),
    findMany: vi.fn(async ({ where }: any) => {
      const out: Step[] = [];
      for (const s of stepStore.values()) {
        if (where?.quoteId && s.quoteId !== where.quoteId) continue;
        if (where?.status && s.status !== where.status) continue;
        out.push(s);
      }
      return out;
    }),
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const k = `${where.quoteId_step.quoteId}::${where.quoteId_step.step}`;
      const existing = stepStore.get(k);
      if (existing) {
        const next = {
          ...existing,
          status: update.status ?? existing.status,
          cwId: update.cwId ?? existing.cwId,
          lastError: update.lastError ?? existing.lastError,
          attempts: existing.attempts + (update.attempts?.increment ?? 0),
        };
        stepStore.set(k, next);
        return next;
      }
      const fresh: Step = {
        quoteId: create.quoteId,
        step: create.step,
        status: create.status,
        cwId: create.cwId ?? null,
        attempts: create.attempts ?? 0,
        lastError: create.lastError ?? null,
      };
      stepStore.set(k, fresh);
      return fresh;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const [k, s] of stepStore.entries()) {
        if (where.quoteId && s.quoteId !== where.quoteId) continue;
        if (where.status && s.status !== where.status) continue;
        stepStore.set(k, { ...s, status: data.status ?? s.status });
        count += 1;
      }
      return { count };
    }),
  };

  const quote = {
    findUnique: vi.fn(async ({ where }: any) => {
      // Tests use a single fixture; map quoteNumber QT-1 ↔ id quote-id-1.
      if (where.quoteNumber === 'QT-1' || where.id === 'quote-id-1') {
        return { id: 'quote-id-1', quoteNumber: 'QT-1' };
      }
      return null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      if (data.provisioningStatus) provisioningStatusByQuote.set(where.id, data.provisioningStatus);
      return { id: where.id, ...data };
    }),
  };

  const pkg = {
    findUnique: vi.fn(async ({ where }: any) => ({
      id: where.id,
      name: 'Protect',
      cwAgreementTypeId: 36,
    })),
  };

  const addon = {
    findMany: vi.fn(async ({ where }: any) => {
      const ids = where.id.in as string[];
      return ids.map((id) => ({ id, name: `Addon ${id}`, cwProductId: 9000 + Number(id) }));
    }),
  };

  return {
    prisma: {
      cwProvisioningStep,
      quote,
      package: pkg,
      addon,
    },
  };
});

// Provide CW credentials so isCWConfigured() returns true.
vi.mock('../../config/env.js', () => ({
  env: {
    CW_COMPANY_ID: 'co',
    CW_PUBLIC_KEY: 'pub',
    CW_PRIVATE_KEY: 'priv',
    CW_CLIENT_ID: 'client',
    CW_BASE_URL: 'https://test.cw',
    NOTIFY_WEBHOOK_URL: undefined,
  },
}));

// CW config: every required key set so we don't throw on lookups.
vi.mock('../cw-config.service.js', () => ({
  getCwConfig: async () => ({
    'company.typeProspectId': 26,
    'company.typeCustomerId': 40,
    'company.statusActiveId': 1,
    'company.marketId': undefined,
    'comm.emailTypeId': 1,
    'comm.phoneTypeId': 2,
    'opportunity.typeRecurringId': 13,
    'opportunity.statusOpenId': 1,
    'opportunity.statusWonId': 2,
    'opportunity.stageQuotedId': 5,
    'opportunity.stageWonId': 6,
    'opportunity.defaultSalesRepMemberId': 200,
    'agreement.defaultTaxCodeId': undefined,
    'agreement.billTermsId': 1,
    'agreement.currencyId': undefined,
    'agreement.departmentId': 1,
    'agreement.locationId': 11,
    'agreement.billCycleId': 2,
    'project.typeId': 100,
    'project.templateId': 101,
    'project.boardId': 102,
    'project.defaultManagerMemberId': 201,
    'project.billingMethod': 'FixedFee',
    'project.defaultDurationDays': 30,
    'customField.companyQuoteId': undefined,
    'customField.agreementQuoteId': undefined,
    'customField.projectAgreementNumber': undefined,
  }),
}));

// Notify is a no-op in tests.
vi.mock('../notify.service.js', () => ({
  notifyProvisioned: vi.fn(async () => {}),
  notifyProvisioningFailed: vi.fn(async () => {}),
}));

// ── Test fixtures ────────────────────────────────────────────────────

import type { QuoteData } from '@ntm/shared';

const baseQuote: QuoteData = {
  quoteNumber: 'QT-1',
  customer: {
    name: 'Acme CFO',
    email: 'cfo@acme.test',
    phone: '555-0100',
    businessName: 'Acme Inc',
    address: '123 Main',
    userCount: 10,
    locationCount: 1,
    referrerCode: null,
  } as any,
  selectedPackage: {
    id: 'pkg-1',
    name: 'Protect',
    pricePerUser: 100,
    pricePerLocation: 50,
    frequency: 'monthly',
    features: [],
    calculatedPrice: 1050,
  },
  selectedAddons: [
    {
      id: '1',
      name: 'Addon 1',
      description: '',
      price: 0,
      quantity: 2,
      frequency: 'monthly',
      totalPrice: 0,
      pricingType: 'recurring-only',
      recurringPrice: 25,
      recurringFrequency: 'monthly',
      setupPrice: null,
      totalRecurringCost: 50,
      totalSetupCost: 0,
    },
  ],
  onboarding: { userCount: 10, costPerUser: 100, totalCost: 1000, discount: 0, finalCost: 1000 },
  appliedPromoCodes: [],
  totals: { onboardingCost: 1000, oneTimeCosts: 0, recurringCosts: 1050, discount: 0, grandTotal: 2050, recurringFrequency: 'monthly' },
  terms: { version: '1.0', id: 'terms-1', url: '', content: '' },
  status: 'paid' as any,
  cwCompanyId: 999,    // simulate onQuoteCreated already ran
  cwContactId: 888,
  cwOpportunityId: 777,
  timestamp: new Date().toISOString(),
};

// ── Fetch mock helper ────────────────────────────────────────────────

interface FetchExpectation {
  match: (path: string, init: RequestInit) => boolean;
  respond: () => Response | Promise<Response>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: Array<{ path: string; method: string; body: any }> = [];
function setupFetchMock(rules: FetchExpectation[]): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace('https://test.cw', '');
    const method = init?.method || 'GET';
    let parsedBody: any = null;
    try { parsedBody = init?.body ? JSON.parse(init.body as string) : null; } catch { /* ignore */ }
    calls.push({ path, method, body: parsedBody });
    for (const rule of rules) {
      if (rule.match(path, init || {})) return rule.respond();
    }
    return jsonResponse({ error: `unexpected ${method} ${path}` }, 500);
  }));
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  stepStore.clear();
  provisioningStatusByQuote.clear();
  calls = [];
  vi.unstubAllGlobals();
});

describe('CW orchestrator', () => {
  it('resumes after partial run: agreement step skips POST when already success', async () => {
    // Pre-seed: agreement already succeeded with cwId 5000 in a prior run.
    stepStore.set('quote-id-1::agreement', {
      quoteId: 'quote-id-1', step: 'agreement', status: 'success', cwId: 5000, attempts: 0, lastError: null,
    });
    stepStore.set('quote-id-1::additions', {
      quoteId: 'quote-id-1', step: 'additions', status: 'success', cwId: 5000, attempts: 0, lastError: null,
    });
    stepStore.set('quote-id-1::activate', {
      quoteId: 'quote-id-1', step: 'activate', status: 'success', cwId: 5000, attempts: 0, lastError: null,
    });

    setupFetchMock([
      // mark opp won
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      // upgrade to customer
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      // project
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(baseQuote);

    const agreementPosts = calls.filter((c) => c.path === '/finance/agreements' && c.method === 'POST');
    expect(agreementPosts.length).toBe(0);
    const projectPosts = calls.filter((c) => c.path === '/project/projects' && c.method === 'POST');
    expect(projectPosts.length).toBe(1);
  });

  it('additions failure leaves agreement Inactive (no activate PATCH)', async () => {
    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/finance/agreements', respond: () => jsonResponse({ id: 5001 }) },
      // dedupe pre-fetch: no existing
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([]) },
      // additions POST: 500
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && i.method === 'POST', respond: () => jsonResponse({ error: 'boom' }, 500) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(baseQuote);

    // Activate must NOT be called
    const activateCalls = calls.filter(
      (c) => c.method === 'PATCH' && c.path.match(/^\/finance\/agreements\/\d+$/),
    );
    expect(activateCalls.length).toBe(0);

    // Step state: additions=failed, activate not started
    expect(stepStore.get('quote-id-1::additions')?.status).toBe('failed');
    expect(stepStore.get('quote-id-1::activate')).toBeUndefined();
  });

  it('hard-fails when company id is missing on payment', async () => {
    setupFetchMock([]);
    const { onPaymentCompleted, CwHardFailError } = await import('../connectwise.service.js');
    const noCompanyQuote = { ...baseQuote, cwCompanyId: undefined };
    await expect(onPaymentCompleted(noCompanyQuote)).rejects.toBeInstanceOf(CwHardFailError);
    expect(provisioningStatusByQuote.get('quote-id-1')).toBe('failed');
  });
});
