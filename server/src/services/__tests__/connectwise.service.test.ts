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
// Quote row status served by the prisma mock (replayProvisioning gates on it).
let mockQuoteStatus = 'paid';

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
      // status is mutable via setMockQuoteStatus for the replay-gate test.
      if (where.quoteNumber === 'QT-1' || where.id === 'quote-id-1') {
        return { id: 'quote-id-1', quoteNumber: 'QT-1', status: mockQuoteStatus };
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
      // Real CW catalog product ids so postAdditions actually attempts the
      // per-user and per-location lines. The 0-location test relies on the
      // per-location id being present, so a skipped location line is a
      // genuine guard, not a no-op from a missing product id.
      pricePerUserF3: 0,
      cwPerUserProductId: 1100,
      cwPerUserF3ProductId: 1101,
      cwPerLocationProductId: 1102,
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
    // Fallback agreement type for package-less quotes.
    'agreement.defaultTypeId': 36,
    'project.typeId': 100,
    'project.existingCustomerTypeId': undefined,
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
  mockQuoteStatus = 'paid';
  vi.unstubAllGlobals();
});

// Seed the steps onQuoteCreated would have recorded at quote-creation time.
// Needed by tests asserting the final provisioned rollup, which requires
// company + contact to be success/skipped.
function seedQuoteCreatedSteps() {
  stepStore.set('quote-id-1::company', {
    quoteId: 'quote-id-1', step: 'company', status: 'success', cwId: 999, attempts: 0, lastError: null,
  });
  stepStore.set('quote-id-1::contact', {
    quoteId: 'quote-id-1', step: 'contact', status: 'success', cwId: 888, attempts: 0, lastError: null,
  });
}

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

  it('skips the per-location agreement addition when locationCount is 0', async () => {
    // A 0-location quote (customer with no managed site) must still push the
    // desktop-user line + add-ons, but NOT a per-location Addition — even
    // though the package carries a per-location price and CW product id.
    const zeroLocationQuote: QuoteData = {
      ...baseQuote,
      customer: { ...(baseQuote.customer as any), locationCount: 0, webUserCount: 0 },
    };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/finance/agreements' && i.method === 'POST', respond: () => jsonResponse({ id: 5001 }) },
      // billStartDate lookup (wrapped in try/catch in the service)
      { match: (p) => p.startsWith('/finance/agreements/5001') && p.includes('billStartDate'), respond: () => jsonResponse({ billStartDate: '2026-07-01T00:00:00Z' }) },
      // dedupe pre-fetch: nothing existing yet
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([]) },
      // additions POST: succeed
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      // activate agreement
      { match: (p, i) => p === '/finance/agreements/5001' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(zeroLocationQuote);

    const additionPosts = calls.filter(
      (c) => c.method === 'POST' && /^\/finance\/agreements\/5001\/additions/.test(c.path),
    );
    // No per-location line (product 1102 / "Per Location" description) posted.
    expect(additionPosts.some((c) => c.body?.product?.id === 1102)).toBe(false);
    expect(additionPosts.some((c) => /per location/i.test(c.body?.description ?? ''))).toBe(false);
    // The desktop-user line DID post — proving additions ran and only the
    // location line was suppressed (not the whole step skipped).
    expect(additionPosts.some((c) => c.body?.product?.id === 1100)).toBe(true);
    // Agreement still activated, i.e. the additions step succeeded.
    const activateCalls = calls.filter(
      (c) => c.method === 'PATCH' && /^\/finance\/agreements\/5001$/.test(c.path),
    );
    expect(activateCalls.length).toBe(1);
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

  // ── Existing-customer mode ─────────────────────────────────────────

  it('existing customer: reuses the active agreement, adds only, never patches it, no template on project', async () => {
    seedQuoteCreatedSteps();
    const existingQuote: QuoteData = {
      ...baseQuote,
      isExistingCustomer: true,
    };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      // Active-agreement discovery on the company → one match, same type as pkg
      {
        match: (p, i) => p.startsWith('/finance/agreements?conditions=') && (i.method ?? 'GET') === 'GET',
        respond: () =>
          jsonResponse([
            { id: 4200, name: 'Protect - Acme Inc', type: { id: 36, name: 'MSA' }, agreementStatus: 'Active', startDate: '2024-01-01' },
          ]),
      },
      // billStartDate lookup: far in the past (old agreement)
      { match: (p) => p.startsWith('/finance/agreements/4200?fields=billStartDate'), respond: () => jsonResponse({ billStartDate: '2024-01-01T00:00:00Z' }) },
      // dedupe pre-fetch: agreement already has additions from years of service
      { match: (p, i) => p.startsWith('/finance/agreements/4200/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([{ id: 1, description: 'Legacy line — do not touch' }]) },
      { match: (p, i) => p.startsWith('/finance/agreements/4200/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    const result = await onPaymentCompleted(existingQuote);

    // Reused the existing agreement — no new agreement POSTed.
    expect(result.cwAgreementId).toBe(4200);
    expect(calls.filter((c) => c.path === '/finance/agreements' && c.method === 'POST').length).toBe(0);

    // Add-only: additions POSTed onto 4200; the agreement itself NEVER
    // PATCHed (no activate, no status flip) and no DELETE anywhere.
    const additionPosts = calls.filter((c) => c.method === 'POST' && /^\/finance\/agreements\/4200\/additions/.test(c.path));
    expect(additionPosts.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.method === 'PATCH' && /^\/finance\/agreements\/4200$/.test(c.path)).length).toBe(0);
    expect(calls.filter((c) => c.method === 'DELETE').length).toBe(0);

    // Additions never back-bill: effectiveDate must be later than the old
    // agreement's 2024 billStartDate.
    for (const post of additionPosts) {
      expect(post.body.effectiveDate > '2024-01-01').toBe(true);
    }

    // Company left alone: no Customer-type association, no status flip.
    expect(calls.filter((c) => c.path === '/company/companyTypeAssociations').length).toBe(0);
    expect(calls.filter((c) => c.method === 'PATCH' && c.path === '/company/companies/999').length).toBe(0);

    // Project created WITHOUT the onboarding template and scoped as an addition.
    const projectPost = calls.find((c) => c.path === '/project/projects' && c.method === 'POST');
    expect(projectPost).toBeDefined();
    expect(projectPost!.body.projectTemplateId).toBeUndefined();
    expect(projectPost!.body.description).toContain('EXISTING CUSTOMER');

    // Activate recorded as skipped → still rolls up as provisioned.
    expect(stepStore.get('quote-id-1::activate')?.status).toBe('skipped');
    expect(provisioningStatusByQuote.get('quote-id-1')).toBe('provisioned');
  });

  it('existing customer with pinned agreement id: additions land on that agreement', async () => {
    const pinnedQuote: QuoteData = {
      ...baseQuote,
      isExistingCustomer: true,
      cwAgreementId: 5555,
    };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      // pinned-agreement existence + status check
      { match: (p) => p.startsWith('/finance/agreements/5555?fields=id'), respond: () => jsonResponse({ id: 5555, agreementStatus: 'Active', cancelledFlag: false }) },
      { match: (p) => p.startsWith('/finance/agreements/5555?fields=billStartDate'), respond: () => jsonResponse({ billStartDate: '2023-06-01T00:00:00Z' }) },
      { match: (p, i) => p.startsWith('/finance/agreements/5555/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([]) },
      { match: (p, i) => p.startsWith('/finance/agreements/5555/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    const result = await onPaymentCompleted(pinnedQuote);

    expect(result.cwAgreementId).toBe(5555);
    // No discovery needed, no create, no patch.
    expect(calls.filter((c) => c.path === '/finance/agreements' && c.method === 'POST').length).toBe(0);
    expect(calls.filter((c) => c.method === 'PATCH' && /^\/finance\/agreements\/5555$/.test(c.path)).length).toBe(0);
    expect(calls.filter((c) => c.method === 'POST' && /^\/finance\/agreements\/5555\/additions/.test(c.path)).length).toBeGreaterThan(0);
  });

  // ── Fully-stripped / package-less quotes ───────────────────────────

  it('package-less quote: posts only addon + custom-item additions', async () => {
    const noPkgQuote: QuoteData = {
      ...baseQuote,
      selectedPackage: null,
      customItems: [
        { id: 'ci-1', name: 'Yealink T54W Phones', quantity: 10, recurringPrice: 5, recurringFrequency: 'monthly', oneTimePrice: 150, cwProductId: 3333 },
      ],
      onboarding: { userCount: 0, costPerUser: 0, totalCost: 0, discount: 0, finalCost: 0 },
      totals: { onboardingCost: 0, oneTimeCosts: 1500, recurringCosts: 100, discount: 0, grandTotal: 1600, recurringFrequency: 'monthly' },
    };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/company/companyTypeAssociations', respond: () => jsonResponse({}) },
      // New agreement created with the fallback default type (36 in mock cfg below is absent → this test asserts the failure-free path via package fallback… the mock cfg has no agreement.defaultTypeId, so we mock the POST to still return an id if called)
      { match: (p, i) => p === '/finance/agreements' && i.method === 'POST', respond: () => jsonResponse({ id: 5001 }) },
      { match: (p) => p.startsWith('/finance/agreements/5001?fields=billStartDate'), respond: () => jsonResponse({ billStartDate: '2099-01-01' }) },
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([]) },
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      { match: (p, i) => p === '/finance/agreements/5001' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(noPkgQuote);

    const additionPosts = calls.filter((c) => c.method === 'POST' && /additions/.test(c.path));
    // No package lines (products 1100/1101/1102) — only addon 9001 and custom 3333.
    expect(additionPosts.some((c) => [1100, 1101, 1102].includes(c.body?.product?.id))).toBe(false);
    expect(additionPosts.some((c) => c.body?.product?.id === 9001)).toBe(true);
    const customPost = additionPosts.find((c) => c.body?.product?.id === 3333);
    expect(customPost).toBeDefined();
    expect(customPost!.body.quantity).toBe(10);
    expect(customPost!.body.unitPrice).toBe(5);
  });

  it('quote with no recurring lines: skips agreement/additions/activate, still creates the project', async () => {
    seedQuoteCreatedSteps();
    const oneTimeOnlyQuote: QuoteData = {
      ...baseQuote,
      selectedPackage: null,
      selectedAddons: [],
      customItems: [
        { id: 'ci-1', name: 'Server rack install', quantity: 1, oneTimePrice: 2500 },
      ],
      onboarding: { userCount: 0, costPerUser: 0, totalCost: 0, discount: 0, finalCost: 0 },
      totals: { onboardingCost: 0, oneTimeCosts: 2500, recurringCosts: 0, discount: 0, grandTotal: 2500, recurringFrequency: 'monthly' },
    };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/company/companyTypeAssociations', respond: () => jsonResponse({}) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(oneTimeOnlyQuote);

    // No agreement traffic at all.
    expect(calls.filter((c) => /\/finance\/agreements/.test(c.path)).length).toBe(0);
    expect(stepStore.get('quote-id-1::agreement')?.status).toBe('skipped');
    expect(stepStore.get('quote-id-1::additions')?.status).toBe('skipped');
    expect(stepStore.get('quote-id-1::activate')?.status).toBe('skipped');
    // Project still created for the work itself.
    expect(calls.filter((c) => c.path === '/project/projects' && c.method === 'POST').length).toBe(1);
    // Skipped steps satisfy the provisioned rollup.
    expect(provisioningStatusByQuote.get('quote-id-1')).toBe('provisioned');
  });

  it('quantity increase on a reused agreement posts a DELTA line, never a duplicate or a skip', async () => {
    // Existing customer whose agreement already bills 10 desktop seats; the
    // quote (e.g. an amendment) asks for 15. Add-only means: post 5 more as a
    // tagged delta line, touch nothing else.
    seedQuoteCreatedSteps();
    const existingQuote: QuoteData = { ...baseQuote, isExistingCustomer: true };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      {
        match: (p, i) => p.startsWith('/finance/agreements?conditions=') && (i.method ?? 'GET') === 'GET',
        respond: () =>
          jsonResponse([
            { id: 4200, name: 'Protect - Acme Inc', type: { id: 36 }, agreementStatus: 'Active' },
          ]),
      },
      { match: (p) => p.startsWith('/finance/agreements/4200?fields=billStartDate'), respond: () => jsonResponse({ billStartDate: '2024-01-01T00:00:00Z' }) },
      // Agreement already carries the desktop-user line at qty 4 and the
      // addon at qty 2 (fully covered).
      {
        match: (p, i) => p.startsWith('/finance/agreements/4200/additions') && (i.method ?? 'GET') === 'GET',
        respond: () =>
          jsonResponse([
            { id: 1, description: 'Protect — Desktop User', quantity: 4 },
            { id: 2, description: 'Addon 1', quantity: 2 },
          ]),
      },
      { match: (p, i) => p.startsWith('/finance/agreements/4200/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(existingQuote);

    const additionPosts = calls.filter((c) => c.method === 'POST' && /additions/.test(c.path));
    // Desktop-user line: quote asks 10, agreement has 4 → post the 6-seat
    // delta under a quote-tagged description.
    const deltaPost = additionPosts.find((c) => c.body?.product?.id === 1100);
    expect(deltaPost).toBeDefined();
    expect(deltaPost!.body.quantity).toBe(6);
    expect(deltaPost!.body.description).toBe('Protect — Desktop User (added QT-1)');
    // Addon fully covered (existing 2 >= quoted 2) → nothing posted for it.
    expect(additionPosts.some((c) => c.body?.product?.id === 9001)).toBe(false);
    // Per-location: not on the agreement yet → full line, base description.
    const locPost = additionPosts.find((c) => c.body?.product?.id === 1102);
    expect(locPost).toBeDefined();
    expect(locPost!.body.description).toBe('Protect — Per Location');
    // Still add-only: nothing PATCHed or DELETEd on the reused agreement.
    expect(calls.filter((c) => c.method === 'PATCH' && /^\/finance\/agreements\/4200$/.test(c.path)).length).toBe(0);
    expect(calls.filter((c) => c.method === 'DELETE').length).toBe(0);
  });

  it('resume after additions failure still activates the agreement this flow created', async () => {
    // Run-1 created agreement 5001 (Inactive) but additions failed; the
    // webhook persisted cwAgreementId. The retry must NOT mistake the
    // agreement for a reused one — it re-derives from live status and
    // activates.
    seedQuoteCreatedSteps();
    stepStore.set('quote-id-1::agreement', {
      quoteId: 'quote-id-1', step: 'agreement', status: 'success', cwId: 5001, attempts: 0, lastError: null,
    });
    const resumedQuote: QuoteData = { ...baseQuote, cwAgreementId: 5001 };

    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/company/companyTypeAssociations', respond: () => jsonResponse({}) },
      { match: (p) => p.startsWith('/finance/agreements/5001?fields=billStartDate'), respond: () => jsonResponse({ billStartDate: '2099-01-01' }) },
      // activate re-derivation: agreement is still Inactive → it's ours
      { match: (p) => p.startsWith('/finance/agreements/5001?fields=agreementStatus'), respond: () => jsonResponse({ agreementStatus: 'Inactive' }) },
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([]) },
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      { match: (p, i) => p === '/finance/agreements/5001' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(resumedQuote);

    // The Inactive agreement WAS activated on resume.
    const activatePatches = calls.filter(
      (c) => c.method === 'PATCH' && /^\/finance\/agreements\/5001$/.test(c.path),
    );
    expect(activatePatches.length).toBe(1);
    expect(provisioningStatusByQuote.get('quote-id-1')).toBe('provisioned');
  });

  it('replayProvisioning refuses to run for unpaid quotes', async () => {
    mockQuoteStatus = 'draft';
    setupFetchMock([]);
    const { replayProvisioning } = await import('../connectwise.service.js');
    await replayProvisioning('QT-1');
    // No CW traffic at all — the payment pipeline must not run pre-payment.
    expect(calls.length).toBe(0);
  });

  it('new customer still gets template project + activated agreement (regression)', async () => {
    seedQuoteCreatedSteps();
    setupFetchMock([
      { match: (p, i) => p === '/sales/opportunities/777' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/sales/opportunities/777/notes', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/company/companies/999' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/company/companyTypeAssociations', respond: () => jsonResponse({}) },
      { match: (p, i) => p === '/finance/agreements' && i.method === 'POST', respond: () => jsonResponse({ id: 5001 }) },
      { match: (p) => p.startsWith('/finance/agreements/5001?fields=billStartDate'), respond: () => jsonResponse({ billStartDate: '2099-01-01' }) },
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && (i.method ?? 'GET') === 'GET', respond: () => jsonResponse([]) },
      { match: (p, i) => p.startsWith('/finance/agreements/5001/additions') && i.method === 'POST', respond: () => jsonResponse({ id: 7000 }) },
      { match: (p, i) => p === '/finance/agreements/5001' && i.method === 'PATCH', respond: () => jsonResponse({}) },
      { match: (p) => p === '/project/projects', respond: () => jsonResponse({ id: 6001 }) },
    ]);

    const { onPaymentCompleted } = await import('../connectwise.service.js');
    await onPaymentCompleted(baseQuote);

    // Agreement created AND activated (new-customer flow unchanged).
    expect(calls.filter((c) => c.path === '/finance/agreements' && c.method === 'POST').length).toBe(1);
    expect(calls.filter((c) => c.method === 'PATCH' && /^\/finance\/agreements\/5001$/.test(c.path)).length).toBe(1);
    // Project carries the onboarding template id from config.
    const projectPost = calls.find((c) => c.path === '/project/projects' && c.method === 'POST');
    expect(projectPost!.body.projectTemplateId).toBe(101);
    expect(provisioningStatusByQuote.get('quote-id-1')).toBe('provisioned');
  });
});
