// CW Manage orchestration. Step-based + resumable.
// Reference IDs come from CwConfig (admin UI page /admin/cw-reference-ids).
// State per step lives in CwProvisioningStep (idempotency unique key: quoteId+step).
// Endpoint shapes verified against CW Manage 2026.4 OpenAPI in docs/cw-reference-ids.md.

import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { cred } from './integration-credentials.service.js';
import { getCwConfig, setCwConfig, type CwConfigKey } from './cw-config.service.js';
import {
  getStep,
  recordStep,
  markStarted,
  type CwStep,
} from './cw-state.service.js';
import * as notify from './notify.service.js';
import { logProvisioningStepFailure } from './notify.service.js';
import type { QuoteData } from '@ntm/shared';

// ── Error types ───────────────────────────────────────────────────────

// Hard failure at company creation. Spec rule: if a customer pays and we can't
// even create a company in CW, don't acknowledge the webhook — let AP retry
// and let ops investigate. Caller (webhook handler) catches this and returns 500.
export class CwHardFailError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CwHardFailError';
  }
}

// ── HTTP client ───────────────────────────────────────────────────────

function isCWConfigured(): boolean {
  return !!(cred('CW_COMPANY_ID') && cred('CW_PUBLIC_KEY') && cred('CW_PRIVATE_KEY') && cred('CW_CLIENT_ID'));
}

async function cwFetch(path: string, options: RequestInit = {}): Promise<Response> {
  // CW_DRY_RUN: short-circuit any non-GET so a local UI walkthrough never mutates
  // a real CW instance. Reads still go through (search-by-name, dedupe-additions,
  // sales-rep lookup, etc.). The fake response uses a deterministic id so step
  // state still progresses through the orchestrator.
  const method = (options.method || 'GET').toUpperCase();
  if (env.CW_DRY_RUN && method !== 'GET') {
    const fakeId = Math.floor(Date.now() % 1_000_000) + 900_000_000; // > any real id
    console.log(
      `[CW DRY RUN] ${method} ${path} (would have sent body, returning fake id ${fakeId})`,
    );
    return new Response(JSON.stringify({ id: fakeId, _dryRun: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const companyId = cred('CW_COMPANY_ID') || '';
  const pub = cred('CW_PUBLIC_KEY') || '';
  const priv = cred('CW_PRIVATE_KEY') || '';
  const baseUrl = cred('CW_BASE_URL') || env.CW_BASE_URL;
  const credentials = Buffer.from(`${companyId}+${pub}:${priv}`).toString('base64');

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      clientId: cred('CW_CLIENT_ID') || '',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

async function cwJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await cwFetch(path, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CW ${options.method || 'GET'} ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Project template lookup ───────────────────────────────────────────
// Used by the admin "Find template by name" helper. CW Manage's
// projectTemplates collection supports `conditions=name LIKE "…"` via the
// standard ?conditions= query param.

export interface ProjectTemplateMatch {
  id: number;
  name: string;
}

export async function findProjectTemplatesByName(name: string): Promise<ProjectTemplateMatch[]> {
  if (!isCWConfigured()) throw new Error('CW is not configured');
  const safe = name.replace(/"/g, '');
  // Try exact match first, then a prefix LIKE fallback for typo tolerance.
  const tries = [
    `/project/projectTemplates?conditions=name="${encodeURIComponent(safe)}"`,
    `/project/projectTemplates?conditions=name LIKE "${encodeURIComponent(safe)}%"`,
    `/project/projectTemplates?conditions=name LIKE "%${encodeURIComponent(safe)}%"`,
  ];
  for (const path of tries) {
    try {
      const rows = await cwJson<Array<{ id: number; name: string }>>(path);
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((r) => ({ id: r.id, name: r.name }));
      }
    } catch {
      /* fall through to next pattern */
    }
  }
  return [];
}

// ── Step runner ───────────────────────────────────────────────────────
// Wraps every CW call with state lookup → mark started → execute → record outcome.
// If status was already 'success' on a prior run, we skip the call and return the
// cached cwId. This is what makes the orchestrator resumable from any failure point.

interface StepOutput<T> {
  cwId: number | null;
  result: T;
}

async function runStep<T>(
  quoteId: string,
  step: CwStep,
  fn: () => Promise<StepOutput<T> | null>,
): Promise<{ skipped: boolean; cwId: number | null; result: T | null }> {
  const existing = await getStep(quoteId, step);
  if (existing?.status === 'success') {
    return { skipped: true, cwId: existing.cwId, result: null };
  }
  await markStarted(quoteId, step);
  try {
    const out = await fn();
    if (out === null) {
      await recordStep(quoteId, step, 'skipped');
      return { skipped: true, cwId: null, result: null };
    }
    await recordStep(quoteId, step, 'success', out.cwId);
    return { skipped: false, cwId: out.cwId, result: out.result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    await recordStep(quoteId, step, 'failed', null, msg);
    // Fire-and-forget: emit a detailed log + email to ops. Failure to email
    // never blocks the step itself — we already recorded the failure above.
    void (async () => {
      try {
        const q = await prisma.quote.findUnique({
          where: { id: quoteId },
          select: {
            quoteNumber: true,
            customer: true,
            cwCompanyId: true,
            cwContactId: true,
            cwAgreementId: true,
            cwProjectId: true,
            cwOpportunityId: true,
            provisioningStatus: true,
          },
        });
        if (!q) return;
        const customer = (q.customer as any) || {};
        await logProvisioningStepFailure({
          quoteNumber: q.quoteNumber,
          businessName: customer.businessName ?? '(unknown)',
          customerEmail: customer.email ?? undefined,
          step,
          error: msg,
          stack,
          context: {
            cwCompanyId: q.cwCompanyId,
            cwContactId: q.cwContactId,
            cwAgreementId: q.cwAgreementId,
            cwProjectId: q.cwProjectId,
            cwOpportunityId: q.cwOpportunityId,
            provisioningStatus: q.provisioningStatus,
          },
        });
      } catch (logErr) {
        console.error('[CW] step-failure log emit failed:', logErr);
      }
    })();
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

async function resolveQuoteRowId(quoteNumber: string): Promise<string> {
  const row = await prisma.quote.findUnique({
    where: { quoteNumber },
    select: { id: true },
  });
  if (!row) throw new Error(`Quote ${quoteNumber} not found`);
  return row.id;
}

async function getAgreementTypeIdForPackage(packageId: string): Promise<number | null> {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    select: { cwAgreementTypeId: true, name: true },
  });
  if (!pkg) return null;
  if (!pkg.cwAgreementTypeId) {
    console.warn(`[CW] Package "${pkg.name}" has no cwAgreementTypeId — set it on the package row.`);
    return null;
  }
  return pkg.cwAgreementTypeId;
}

function intCfg(cfg: Awaited<ReturnType<typeof getCwConfig>>, key: CwConfigKey): number | null {
  const v = cfg[key];
  return typeof v === 'number' ? v : null;
}

function strCfg(cfg: Awaited<ReturnType<typeof getCwConfig>>, key: CwConfigKey): string | null {
  const v = cfg[key];
  return typeof v === 'string' ? v : null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// First day of the month after today's. Used as the CW agreement's billStartDate
// so CW doesn't double-bill month 1 — AP already captured it as "First month"
// on the upfront invoice.
function firstOfNextMonthISO(): string {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

// ── Step implementations ──────────────────────────────────────────────

async function findOrCreateCompany(
  customer: QuoteData['customer'],
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
): Promise<{ companyId: number; siteId: number }> {
  // Search by exact name first.
  const safeName = customer.businessName.replace(/'/g, "''");
  const search = await cwJson<any[]>(
    `/company/companies?conditions=name='${encodeURIComponent(safeName)}'&pageSize=1`,
  );
  if (search.length > 0) {
    const existing = search[0];
    const siteId =
      existing.defaultContact?.site?.id || existing.site?.id || 0;
    return { companyId: existing.id, siteId };
  }

  const identifier = customer.businessName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'CUST';
  const prospectTypeId = intCfg(cfg, 'company.typeProspectId');
  const activeStatusId = intCfg(cfg, 'company.statusActiveId');
  if (!prospectTypeId || !activeStatusId) {
    throw new Error('CW config: company.typeProspectId / company.statusActiveId not set');
  }

  const created = await cwJson<any>('/company/companies', {
    method: 'POST',
    body: JSON.stringify({
      name: customer.businessName,
      identifier,
      status: { id: activeStatusId },
      types: [{ id: prospectTypeId }],
      phoneNumber: customer.phone,
      addressLine1: customer.address,
      site: { name: 'Main' },
    }),
  });
  return { companyId: created.id, siteId: created.site?.id || 0 };
}

async function patchSiteTaxCode(
  companyId: number,
  siteId: number,
  taxCodeId: number,
): Promise<void> {
  if (!siteId) return;
  await cwJson(`/company/companies/${companyId}/sites/${siteId}`, {
    method: 'PATCH',
    body: JSON.stringify([{ op: 'replace', path: '/taxCode', value: { id: taxCodeId } }]),
  });
}

async function findContactByCompanyAndName(
  companyId: number,
  firstName: string,
  lastName: string,
): Promise<number | null> {
  // CW supports `company/id` + name conditions on /company/contacts.
  // Quote-escape any embedded apostrophes in names ("O'Brien" etc.).
  const safeFirst = firstName.replace(/'/g, "''");
  const safeLast = lastName.replace(/'/g, "''");
  const conditions = encodeURIComponent(
    `company/id=${companyId} and firstName='${safeFirst}' and lastName='${safeLast}'`,
  );
  try {
    const list = await cwJson<any[]>(
      `/company/contacts?conditions=${conditions}&pageSize=1`,
    );
    return list[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function createContact(
  customer: QuoteData['customer'],
  companyId: number,
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
  isBilling = false,
): Promise<number> {
  const nameParts = customer.name.split(' ');
  const firstName = nameParts[0] || 'Primary';
  const lastName = nameParts.slice(1).join(' ') || firstName;
  const emailTypeId = intCfg(cfg, 'comm.emailTypeId') ?? 1;
  const phoneTypeId = intCfg(cfg, 'comm.phoneTypeId') ?? 2;

  // CW rejects duplicate contacts (same name + email under same company) with
  // code=ContactApi. Look up the existing contact first instead of failing.
  const existing = await findContactByCompanyAndName(companyId, firstName, lastName);
  if (existing) {
    console.log(`[CW] reusing existing contact ${existing} for company ${companyId}`);
    return existing;
  }

  const r = await cwFetch('/company/contacts', {
    method: 'POST',
    body: JSON.stringify({
      firstName,
      lastName,
      company: { id: companyId },
      title: isBilling ? 'Billing Contact' : undefined,
      communicationItems: [
        {
          type: { id: emailTypeId, name: 'Email' },
          value: customer.email,
          communicationType: 'Email',
          defaultFlag: true,
        },
        {
          type: { id: phoneTypeId, name: 'Phone' },
          value: customer.phone,
          communicationType: 'Phone',
          defaultFlag: true,
        },
      ],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    // Fall-through dedupe in case the lookup missed (e.g., different name on
    // the existing contact but same email): if CW says "duplicate", look up
    // again and accept any match.
    if (/duplicate contact/i.test(text)) {
      const recovered = await findContactByCompanyAndName(companyId, firstName, lastName);
      if (recovered) return recovered;
    }
    throw new Error(`CW POST /company/contacts failed (${r.status}): ${text}`);
  }
  const contact = await r.json();
  return contact.id;
}

async function resolveSalesRep(
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
): Promise<number | null> {
  const cached = intCfg(cfg, 'opportunity.defaultSalesRepMemberId');
  if (cached) return cached;
  // Fallback discovery — slow path. Better to set the config explicitly.
  try {
    const members = await cwJson<any[]>(
      '/system/members?pageSize=1&conditions=inactiveFlag=false and salesDefaultFlag=true',
    );
    if (members[0]?.id) return members[0].id;
    const fallback = await cwJson<any[]>(
      '/system/members?pageSize=5&conditions=inactiveFlag=false',
    );
    return (
      fallback.find(
        (m) =>
          m.firstName &&
          !['ConnectWise', 'CalendarSync', 'SimpleSAT', 'BrightGauge', 'ConnectBooster'].includes(
            m.firstName,
          ),
      )?.id ?? null
    );
  } catch {
    return null;
  }
}

async function createOpportunity(
  quote: QuoteData,
  companyId: number,
  contactId: number,
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
): Promise<number> {
  const typeId = intCfg(cfg, 'opportunity.typeRecurringId');
  const statusId = intCfg(cfg, 'opportunity.statusOpenId');
  const stageId = intCfg(cfg, 'opportunity.stageQuotedId');
  if (!typeId || !statusId || !stageId) {
    throw new Error('CW config: opportunity.typeRecurringId/statusOpenId/stageQuotedId not set');
  }
  const salesRepId = await resolveSalesRep(cfg);
  if (!salesRepId) {
    throw new Error('CW config: opportunity.defaultSalesRepMemberId not set and no fallback found');
  }
  const expectedClose = plusDaysISO(30);

  const opp = await cwJson<any>('/sales/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      name: `Quoting Tool - ${quote.customer.businessName} - ${quote.selectedPackage.name}`,
      company: { id: companyId },
      contact: { id: contactId },
      primarySalesRep: { id: salesRepId },
      type: { id: typeId },
      status: { id: statusId },
      stage: { id: stageId },
      source: 'Quote Builder',
      expectedCloseDate: `${expectedClose}T00:00:00Z`,
      notes: [
        `Quote: ${quote.quoteNumber}`,
        `Package: ${quote.selectedPackage.name}`,
        `Users: ${quote.customer.userCount}`,
        `Locations: ${quote.customer.locationCount}`,
        `Recurring: $${quote.totals.recurringCosts.toFixed(2)}/${quote.totals.recurringFrequency}`,
        `One-time: $${(quote.totals.onboardingCost + quote.totals.oneTimeCosts).toFixed(2)}`,
        `Addons: ${quote.selectedAddons.map((a) => a.name).join(', ') || 'None'}`,
      ].join('\n'),
    }),
  });
  return opp.id;
}

async function createAgreement(
  quote: QuoteData,
  companyId: number,
  contactId: number,
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
): Promise<number> {
  const agreementTypeId = await getAgreementTypeIdForPackage(quote.selectedPackage.id);
  if (!agreementTypeId) {
    throw new Error(
      `Package "${quote.selectedPackage.name}" has no cwAgreementTypeId — set it on the package row first`,
    );
  }
  const today = todayISO();
  // billStartDate is first of next month: AP already captured month 1 as the
  // "First month" line on the upfront invoice, so CW starts billing from month 2.
  const billStart = firstOfNextMonthISO();
  const billTermsId = intCfg(cfg, 'agreement.billTermsId');
  const locationId = intCfg(cfg, 'agreement.locationId');
  const departmentId = intCfg(cfg, 'agreement.departmentId');
  const currencyId = intCfg(cfg, 'agreement.currencyId');

  // Inactive on create; a separate 'activate' step PATCHes to Active after additions
  // exist. This is the spec's "don't ship a live agreement with no line items" guard.
  // Note: `billCycleId` is NOT a top-level field on CW Manage's Agreement; the
  // billing cycle comes from the agreement type's defaults. Don't send it.
  const agreement = await cwJson<any>('/finance/agreements', {
    method: 'POST',
    body: JSON.stringify({
      name: `${quote.selectedPackage.name} - ${quote.customer.businessName}`,
      type: { id: agreementTypeId },
      company: { id: companyId },
      contact: { id: contactId },
      startDate: today,
      noEndingDateFlag: true,
      billAmount: quote.totals.recurringCosts,
      billStartDate: billStart,
      agreementStatus: 'Inactive',
      // CW Manage's Agreement schema uses billingTerms reference, not billTermsId.
      ...(billTermsId ? { billingTerms: { id: billTermsId } } : {}),
      ...(locationId ? { location: { id: locationId } } : {}),
      ...(departmentId ? { department: { id: departmentId } } : {}),
      ...(currencyId ? { currency: { id: currencyId } } : {}),
    }),
  });
  return agreement.id;
}

// Posts every recurring line as an Agreement Addition: the package's own
// per-user and per-location lines, plus every selected recurring addon.
// Addition.product is required by CW Manage 2026.4 — anything missing a
// productId is reported back in `missingProductIds` so ops can fix it.
// Idempotent: GETs existing additions and skips ones whose description matches
// an already-posted line, so a partial-failure retry doesn't duplicate.
async function postAdditions(
  agreementId: number,
  quote: QuoteData,
): Promise<{ posted: number; skipped: number; missingProductIds: string[] }> {
  let posted = 0;
  let skipped = 0;
  const missing: string[] = [];

  // CW rejects additions with effectiveDate < agreement.billStartDate. Pull
  // the agreement's real billStartDate so we line up with whatever CW stored
  // (could differ from firstOfNextMonthISO() if the agreement was created
  // a long time ago, or if ops adjusted it manually). Fall back to
  // tomorrow's first-of-month if the GET fails.
  let effectiveDate = firstOfNextMonthISO();
  try {
    const agreement = await cwJson<{ billStartDate?: string }>(
      `/finance/agreements/${agreementId}?fields=billStartDate`,
    );
    if (agreement?.billStartDate) {
      effectiveDate = agreement.billStartDate.slice(0, 10);
    }
  } catch (e) {
    console.warn(
      `[CW] could not read billStartDate for agreement ${agreementId} — using ${effectiveDate}:`,
      e,
    );
  }

  // Pre-fetch existing additions on this agreement for dedupe-by-description.
  const existing = await cwJson<Array<{ id: number; description?: string }>>(
    `/finance/agreements/${agreementId}/additions?pageSize=1000&fields=id,description`,
  ).catch(() => [] as Array<{ id: number; description?: string }>);
  const existingDescriptions = new Set(existing.map((a) => a.description ?? ''));

  const postLine = async (
    productId: number,
    description: string,
    quantity: number,
    unitPrice: number,
  ) => {
    if (existingDescriptions.has(description)) {
      skipped += 1;
      return;
    }
    await cwJson(`/finance/agreements/${agreementId}/additions`, {
      method: 'POST',
      body: JSON.stringify({
        product: { id: productId },
        description,
        quantity,
        unitPrice,
        // Must be >= agreement.billStartDate per CW's API rule.
        effectiveDate,
        billCustomer: 'Billable',
      }),
    });
    posted += 1;
  };

  // ── Package lines (Desktop user + Web user + per-location) ──
  // Pull the current package record so we have the latest CW product IDs and
  // F3 pricing. Quotes don't snapshot product IDs because they're CW-internal
  // plumbing — ops can correct mis-mapped IDs on the package row and replay
  // provisioning without re-issuing the customer's quote.
  const pkg = await prisma.package.findUnique({
    where: { id: quote.selectedPackage.id },
    select: {
      name: true,
      pricePerUserF3: true,
      cwPerUserProductId: true,
      cwPerUserF3ProductId: true,
      cwPerLocationProductId: true,
    },
  });

  const desktopUserCount = quote.customer.userCount ?? 0;
  const webUserCount = (quote.customer as any).webUserCount ?? 0;
  const locationCount = quote.customer.locationCount ?? 0;
  const pricePerUser = quote.selectedPackage.pricePerUser ?? 0;
  const pricePerUserF3 = pkg?.pricePerUserF3 ?? 0;
  const pricePerLocation = quote.selectedPackage.pricePerLocation ?? 0;

  if (desktopUserCount > 0 && pricePerUser > 0) {
    if (pkg?.cwPerUserProductId) {
      await postLine(
        pkg.cwPerUserProductId,
        `${quote.selectedPackage.name} — Desktop User`,
        desktopUserCount,
        pricePerUser,
      );
    } else {
      missing.push(`${quote.selectedPackage.name} per-user (Desktop)`);
    }
  }

  if (webUserCount > 0 && pricePerUserF3 > 0) {
    if (pkg?.cwPerUserF3ProductId) {
      await postLine(
        pkg.cwPerUserF3ProductId,
        `${quote.selectedPackage.name} — Web User`,
        webUserCount,
        pricePerUserF3,
      );
    } else {
      missing.push(`${quote.selectedPackage.name} per-user (Web/F3)`);
    }
  }

  if (locationCount > 0 && pricePerLocation > 0) {
    if (pkg?.cwPerLocationProductId) {
      await postLine(
        pkg.cwPerLocationProductId,
        `${quote.selectedPackage.name} — Per Location`,
        locationCount,
        pricePerLocation,
      );
    } else {
      missing.push(`${quote.selectedPackage.name} per-location`);
    }
  }

  // ── Addon lines ──
  const addonIds = quote.selectedAddons.map((a) => a.id);
  const dbAddons = addonIds.length
    ? await prisma.addon.findMany({
        where: { id: { in: addonIds } },
        select: { id: true, name: true, cwProductId: true },
      })
    : [];
  const productIdByAddon = new Map(dbAddons.map((a) => [a.id, a.cwProductId] as const));

  for (const addon of quote.selectedAddons) {
    const isRecurring = addon.pricingType !== 'one-time-only' && (addon.recurringPrice ?? 0) > 0;
    if (!isRecurring) {
      skipped += 1;
      continue;
    }
    const productId = productIdByAddon.get(addon.id);
    if (!productId) {
      missing.push(addon.name);
      skipped += 1;
      continue;
    }
    await postLine(productId, addon.name, addon.quantity, addon.recurringPrice ?? 0);
  }

  return { posted, skipped, missingProductIds: missing };
}

async function activateAgreement(agreementId: number): Promise<void> {
  await cwJson(`/finance/agreements/${agreementId}`, {
    method: 'PATCH',
    body: JSON.stringify([{ op: 'replace', path: '/agreementStatus', value: 'Active' }]),
  });
}

async function createProject(
  quote: QuoteData,
  companyId: number,
  contactId: number,
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
): Promise<number> {
  const boardId = intCfg(cfg, 'project.boardId');
  if (!boardId) {
    throw new Error('CW config: project.boardId is required (CW Project schema requires board)');
  }
  const typeId = intCfg(cfg, 'project.typeId');
  let templateId = intCfg(cfg, 'project.templateId');
  // When project.templateId isn't set, fall back to looking up the
  // configured project.templateName (e.g. "SafeSecure Pure SaaS (Project
  // Template) v3"). Resolved id gets cached back into project.templateId
  // so subsequent provisioning calls skip the lookup.
  if (!templateId) {
    const templateName = strCfg(cfg, 'project.templateName');
    if (templateName) {
      try {
        const matches = await findProjectTemplatesByName(templateName);
        if (matches.length > 0) {
          templateId = matches[0].id;
          await setCwConfig('project.templateId', String(templateId));
          console.log(
            `[CW] resolved project.templateId=${templateId} from name "${templateName}"`,
          );
        } else {
          console.warn(`[CW] no project template matched "${templateName}"`);
        }
      } catch (e) {
        console.error('[CW] template name lookup failed:', e);
      }
    }
  }
  const managerId = intCfg(cfg, 'project.defaultManagerMemberId');
  const billingMethod = strCfg(cfg, 'project.billingMethod') ?? 'FixedFee';
  const durationDays = intCfg(cfg, 'project.defaultDurationDays') ?? 30;

  const start = todayISO();
  const end = plusDaysISO(durationDays);

  // Project name (CW's summary/title field) format: "<Package> - <Company> - <Date>"
  // per NTM convention. Date is ISO (YYYY-MM-DD) so projects sort chronologically.
  const projectName =
    `${quote.selectedPackage.name} - ${quote.customer.businessName} - ${start}`;

  // Description: everything the onboarding PM needs to scope the work — sizing,
  // pricing, addon list with quantities and unit prices, customer contact, and
  // links back to the quote/order so they can pull the full record.
  const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
  const addonLines = quote.selectedAddons.length
    ? quote.selectedAddons.map((a) => {
        const recurring = a.recurringPrice ? `${fmtMoney(a.recurringPrice)}/${a.recurringFrequency || 'mo'}` : null;
        const setup = a.setupPrice ? `${fmtMoney(a.setupPrice)} setup` : null;
        const pricing = [recurring, setup].filter(Boolean).join(', ');
        return `  - ${a.name} × ${a.quantity}${pricing ? ` (${pricing})` : ''}`;
      })
    : ['  (none)'];
  const referrer = (quote.customer as any).referrerCode;
  const description = [
    `Package: ${quote.selectedPackage.name}`,
    `Sizing: ${quote.customer.userCount} user(s), ${quote.customer.locationCount} location(s)`,
    `Recurring: ${fmtMoney(quote.totals.recurringCosts)}/${quote.totals.recurringFrequency}`,
    `One-time: ${fmtMoney(quote.totals.onboardingCost + quote.totals.oneTimeCosts)} (onboarding ${fmtMoney(quote.totals.onboardingCost)} + addons ${fmtMoney(quote.totals.oneTimeCosts)})`,
    '',
    'Add-ons:',
    ...addonLines,
    '',
    `Customer contact: ${quote.customer.name} <${quote.customer.email}> ${quote.customer.phone}`,
    `Address: ${quote.customer.address}`,
    ...(referrer ? [`Referrer: ${referrer}`] : []),
    '',
    `Quote: ${quote.quoteNumber}`,
    `Order: ${(quote as any).orderNumber || 'N/A'}`,
    `Signed: ${start}`,
  ].join('\n');

  const project = await cwJson<any>('/project/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      company: { id: companyId },
      contact: { id: contactId },
      board: { id: boardId },
      billingMethod,
      estimatedStart: `${start}T00:00:00Z`,
      estimatedEnd: `${end}T00:00:00Z`,
      ...(typeId ? { type: { id: typeId } } : {}),
      ...(templateId ? { projectTemplateId: templateId } : {}),
      ...(managerId ? { manager: { id: managerId } } : {}),
      description,
    }),
  });
  return project.id;
}

async function patchCustomFields(
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
  ids: { companyId: number | null; agreementId: number | null; projectId: number | null },
  quote: QuoteData,
): Promise<void> {
  const companyFieldId = intCfg(cfg, 'customField.companyQuoteId');
  const agreementFieldId = intCfg(cfg, 'customField.agreementQuoteId');
  const projectAgreementFieldId = intCfg(cfg, 'customField.projectAgreementNumber');

  // Each PATCH replaces the customFields array. CW expects the full array on PATCH,
  // but we only have the one id we want to set — we use the JSON Patch op for a single
  // entry which CW accepts as a merge into the existing customFields collection.
  const tasks: Promise<unknown>[] = [];

  if (ids.companyId && companyFieldId) {
    tasks.push(
      cwJson(`/company/companies/${ids.companyId}`, {
        method: 'PATCH',
        body: JSON.stringify([
          {
            op: 'replace',
            path: '/customFields',
            value: [{ id: companyFieldId, value: quote.quoteNumber }],
          },
        ]),
      }).catch((e) => console.error('[CW] crossref company custom field failed:', e)),
    );
  }
  if (ids.agreementId && agreementFieldId) {
    tasks.push(
      cwJson(`/finance/agreements/${ids.agreementId}`, {
        method: 'PATCH',
        body: JSON.stringify([
          {
            op: 'replace',
            path: '/customFields',
            value: [{ id: agreementFieldId, value: quote.quoteNumber }],
          },
        ]),
      }).catch((e) => console.error('[CW] crossref agreement custom field failed:', e)),
    );
  }
  if (ids.projectId && projectAgreementFieldId && ids.agreementId) {
    tasks.push(
      cwJson(`/project/projects/${ids.projectId}`, {
        method: 'PATCH',
        body: JSON.stringify([
          {
            op: 'replace',
            path: '/customFields',
            value: [{ id: projectAgreementFieldId, value: String(ids.agreementId) }],
          },
        ]),
      }).catch((e) => console.error('[CW] crossref project custom field failed:', e)),
    );
  }
  await Promise.all(tasks);
}

async function markOppWon(opportunityId: number, cfg: Awaited<ReturnType<typeof getCwConfig>>) {
  const wonStatusId = intCfg(cfg, 'opportunity.statusWonId');
  const wonStageId = intCfg(cfg, 'opportunity.stageWonId');
  if (!wonStatusId || !wonStageId) {
    throw new Error('CW config: opportunity.statusWonId / opportunity.stageWonId not set');
  }
  // CW rejects date-only `closedDate` values with code "UnsupportedFormat".
  // The schema is date-time, so use the full ISO string.
  await cwJson(`/sales/opportunities/${opportunityId}`, {
    method: 'PATCH',
    body: JSON.stringify([
      { op: 'replace', path: '/status', value: { id: wonStatusId } },
      { op: 'replace', path: '/stage', value: { id: wonStageId } },
      { op: 'replace', path: '/closedDate', value: new Date().toISOString() },
    ]),
  });
}

async function updateCompanyToCustomer(
  companyId: number,
  cfg: Awaited<ReturnType<typeof getCwConfig>>,
) {
  const customerTypeId = intCfg(cfg, 'company.typeCustomerId');
  if (!customerTypeId) {
    throw new Error('CW config: company.typeCustomerId not set');
  }
  // CW rejects PATCH of /types on an existing company:
  //   "typeIds can only be used when creating a new company."
  // The supported flow is to add the type via /company/companyTypeAssociations.
  // POST a new association with the customer type. CW idempotency: if the
  // association already exists, the call returns 400 — treat as no-op.
  const r = await cwFetch('/company/companyTypeAssociations', {
    method: 'POST',
    body: JSON.stringify({
      company: { id: companyId },
      type: { id: customerTypeId },
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    if (/already exists|duplicate/i.test(text)) {
      return; // already a Customer; success
    }
    throw new Error(`CW POST /company/companyTypeAssociations failed (${r.status}): ${text}`);
  }
}

async function addOpportunityNote(opportunityId: number, text: string) {
  await cwJson(`/sales/opportunities/${opportunityId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// ── Orchestrators ─────────────────────────────────────────────────────

export interface CwQuoteCreatedResult {
  cwCompanyId?: number;
  cwContactId?: number;
  cwOpportunityId?: number;
}

// Runs at quote creation. Steps: company → site (tax code) → contact → opportunity.
// Soft-fail throughout — at quote creation nothing is paid yet, so no need to
// hard-fail and block the customer flow.
export async function onQuoteCreated(quote: QuoteData): Promise<CwQuoteCreatedResult> {
  if (!isCWConfigured()) {
    console.warn('[CW] Not configured — skipping onQuoteCreated');
    return {};
  }

  const cfg = await getCwConfig();
  const quoteId = await resolveQuoteRowId(quote.quoteNumber);
  const result: CwQuoteCreatedResult = {};

  // Company (also captures siteId, stashed in step.cwId via two passes below)
  let companyId: number | null = null;
  let siteId = 0;
  try {
    const companyStep = await runStep(quoteId, 'company', async () => {
      const r = await findOrCreateCompany(quote.customer, cfg);
      siteId = r.siteId;
      return { cwId: r.companyId, result: r };
    });
    companyId = companyStep.cwId;
    if (companyStep.result) siteId = companyStep.result.siteId;
    if (companyId) result.cwCompanyId = companyId;
  } catch (e) {
    console.error('[CW] onQuoteCreated: company step failed:', e);
    return result; // soft fail — payment hasn't happened yet
  }

  // Site PATCH (tax code) — only if both site id and tax code id are known
  const taxCodeId = intCfg(cfg, 'agreement.defaultTaxCodeId');
  if (companyId && siteId && taxCodeId) {
    await runStep(quoteId, 'site', async () => {
      await patchSiteTaxCode(companyId!, siteId, taxCodeId);
      return { cwId: siteId, result: null };
    }).catch((e) => console.error('[CW] site step failed:', e));
  }

  // Primary contact
  let contactId: number | null = null;
  if (companyId) {
    try {
      const step = await runStep(quoteId, 'contact', async () => {
        const id = await createContact(quote.customer, companyId!, cfg);
        return { cwId: id, result: id };
      });
      contactId = step.cwId;
      if (contactId) result.cwContactId = contactId;
    } catch (e) {
      console.error('[CW] contact step failed:', e);
    }
  }

  // Billing contact step is currently a no-op until the customer schema models a
  // separate billing contact. The step row is recorded as 'skipped' so the retry
  // worker doesn't keep trying it.
  await runStep(quoteId, 'billingContact', async () => null).catch(() => {});

  // Opportunity
  if (companyId && contactId) {
    try {
      const step = await runStep(quoteId, 'opportunity', async () => {
        const id = await createOpportunity(quote, companyId!, contactId!, cfg);
        return { cwId: id, result: id };
      });
      if (step.cwId) result.cwOpportunityId = step.cwId;
    } catch (e) {
      console.error('[CW] opportunity step failed:', e);
    }
  }

  return result;
}

export interface CwPaymentCompletedResult {
  cwCompanyId?: number;
  cwContactId?: number;
  cwOpportunityId?: number;
  cwAgreementId?: number;
  cwProjectId?: number;
}

// Runs at AP webhook payment-confirmed. Steps: markOppWon → companyToCustomer
// → agreement(Inactive) → additions → activate → project → crossref → handoff.
// Hard-fails at the agreement step if config is missing — payment without the
// recurring agreement existing is the worst outcome.
export async function onPaymentCompleted(quote: QuoteData): Promise<CwPaymentCompletedResult> {
  if (!isCWConfigured()) {
    console.warn('[CW] Not configured — skipping onPaymentCompleted');
    return {};
  }

  const cfg = await getCwConfig();
  const quoteId = await resolveQuoteRowId(quote.quoteNumber);
  const result: CwPaymentCompletedResult = {};

  // Recovery path: if `onQuoteCreated` didn't run (network blip, CW outage,
  // creds-misconfig at quote-create time) we won't have a cwCompanyId. Run
  // those steps inline here so payment-time provisioning doesn't hard-fail.
  // findOrCreateCompany is idempotent (it dedupes by name+email) so re-running
  // when a company already exists is safe.
  let companyId = quote.cwCompanyId ?? 0;
  let contactId = quote.cwContactId ?? 0;
  if (!companyId) {
    console.warn(
      `[CW] onPaymentCompleted: ${quote.quoteNumber} has no cwCompanyId — recovering inline`,
    );
    try {
      const created = await runStep(quoteId, 'company', async () => {
        const r = await findOrCreateCompany(quote.customer, cfg);
        return { cwId: r.companyId, result: r };
      });
      companyId = created.cwId ?? 0;
      if (companyId) result.cwCompanyId = companyId;
    } catch (e) {
      console.error('[CW] recovery company step failed:', e);
      await markProvisioningStatus(quoteId, 'failed');
      throw new CwHardFailError(
        `Quote ${quote.quoteNumber} could not create CW company: ${(e as Error)?.message ?? e}`,
      );
    }
    // Try to create the contact too — non-fatal if it fails.
    if (!contactId && companyId) {
      try {
        const step = await runStep(quoteId, 'contact', async () => {
          const id = await createContact(quote.customer, companyId, cfg);
          return { cwId: id, result: id };
        });
        contactId = step.cwId ?? 0;
        if (contactId) result.cwContactId = contactId;
      } catch (e) {
        console.error('[CW] recovery contact step failed:', e);
      }
    }
    // Opportunity recovery — non-fatal; just lets the Won-flip work later.
    if (companyId && contactId && !quote.cwOpportunityId) {
      try {
        const step = await runStep(quoteId, 'opportunity', async () => {
          const id = await createOpportunity(quote, companyId, contactId, cfg);
          return { cwId: id, result: id };
        });
        if (step.cwId) result.cwOpportunityId = step.cwId as any;
      } catch (e) {
        console.error('[CW] recovery opportunity step failed:', e);
      }
    }
  }

  if (!companyId) {
    await markProvisioningStatus(quoteId, 'failed');
    throw new CwHardFailError(
      `Quote ${quote.quoteNumber} still has no cwCompanyId after recovery attempt`,
    );
  }

  // Mark opportunity won (soft-fail; opportunity is non-critical for billing)
  if (quote.cwOpportunityId) {
    await runStep(quoteId, 'opportunity', async () => {
      // We don't re-create here — re-mark with the won status. This step name
      // collides with onQuoteCreated's; safe because that one's status will
      // already be 'success' so runStep returns early. We additionally call
      // markOppWon outside runStep so the won-flip itself isn't gated by
      // step state.
      return { cwId: quote.cwOpportunityId!, result: null };
    });
    try {
      await markOppWon(quote.cwOpportunityId, cfg);
      await addOpportunityNote(
        quote.cwOpportunityId,
        `Payment received via Alternative Payments - Order ${(quote as any).orderNumber || quote.quoteNumber}`,
      );
    } catch (e) {
      console.error('[CW] markOppWon failed:', e);
    }
  }

  // Promote company to Customer type (soft-fail; cosmetic if it doesn't take)
  try {
    await updateCompanyToCustomer(companyId, cfg);
  } catch (e) {
    console.error('[CW] updateCompanyToCustomer failed:', e);
  }

  // Agreement (hard-fail — no recurring billing without it)
  let agreementId: number | null = null;
  try {
    const step = await runStep(quoteId, 'agreement', async () => {
      const id = await createAgreement(quote, companyId, contactId, cfg);
      return { cwId: id, result: id };
    });
    agreementId = step.cwId;
    if (agreementId) result.cwAgreementId = agreementId;
  } catch (e) {
    console.error('[CW] agreement step failed:', e);
    await markProvisioningStatus(quoteId, 'partial');
    // Not a hard fail — payment is captured, ops needs to fix and retry.
    // Return early; remaining steps depend on agreement.
    return result;
  }

  // Additions (soft-fail — agreement remains Inactive, retry worker can finish)
  let additionsOk = false;
  if (agreementId) {
    try {
      const step = await runStep(quoteId, 'additions', async () => {
        const r = await postAdditions(agreementId!, quote);
        if (r.missingProductIds.length > 0) {
          throw new Error(
            `Missing cwProductId for addons: ${r.missingProductIds.join(', ')}`,
          );
        }
        return { cwId: agreementId!, result: r };
      });
      additionsOk = !step.skipped || step.skipped; // either way, success-or-resumed counts
      additionsOk = true;
    } catch (e) {
      console.error('[CW] additions step failed:', e);
      additionsOk = false;
    }
  }

  // Activate agreement (only if additions succeeded)
  if (agreementId && additionsOk) {
    try {
      await runStep(quoteId, 'activate', async () => {
        await activateAgreement(agreementId!);
        return { cwId: agreementId!, result: null };
      });
    } catch (e) {
      console.error('[CW] activate step failed:', e);
    }
  }

  // Project (soft-fail — onboarding can be created manually if this fails)
  let projectId: number | null = null;
  try {
    const step = await runStep(quoteId, 'project', async () => {
      const id = await createProject(quote, companyId, contactId, cfg);
      return { cwId: id, result: id };
    });
    projectId = step.cwId;
    if (projectId) result.cwProjectId = projectId;
  } catch (e) {
    console.error('[CW] project step failed:', e);
  }

  // Cross-reference custom fields (soft-fail; nothing here breaks billing)
  try {
    await runStep(quoteId, 'crossref', async () => {
      await patchCustomFields(
        cfg,
        { companyId, agreementId, projectId },
        quote,
      );
      return { cwId: null, result: null };
    });
  } catch (e) {
    console.error('[CW] crossref step failed:', e);
  }

  // Handoff (notify + status flip)
  try {
    await runStep(quoteId, 'handoff', async () => {
      await notify.notifyProvisioned({
        quoteNumber: quote.quoteNumber,
        businessName: quote.customer.businessName,
        packageName: quote.selectedPackage.name,
        cwCompanyId: companyId,
        cwAgreementId: agreementId,
        cwProjectId: projectId,
      });
      return { cwId: null, result: null };
    });
  } catch (e) {
    console.error('[CW] handoff step failed:', e);
  }

  // Final status: provisioned only if every required step succeeded.
  await markProvisioningStatus(
    quoteId,
    await computeProvisioningStatus(quoteId),
  );

  return result;
}

// ── Provisioning status rollup ────────────────────────────────────────

export async function markProvisioningStatus(
  quoteId: string,
  status: 'pending' | 'partial' | 'provisioned' | 'failed',
) {
  await prisma.quote.update({
    where: { id: quoteId },
    data: { provisioningStatus: status },
  });
}

const REQUIRED_STEPS_FOR_PROVISIONED: CwStep[] = [
  'company',
  'contact',
  'agreement',
  'additions',
  'activate',
  'project',
];

export async function computeProvisioningStatus(
  quoteId: string,
): Promise<'pending' | 'partial' | 'provisioned'> {
  const steps = await prisma.cwProvisioningStep.findMany({
    where: { quoteId },
    select: { step: true, status: true },
  });
  const byStep = new Map(steps.map((s) => [s.step, s.status] as const));
  const hasFailed = steps.some((s) => s.status === 'failed');
  const allRequiredOk = REQUIRED_STEPS_FOR_PROVISIONED.every(
    (s) => byStep.get(s) === 'success',
  );
  if (allRequiredOk && !hasFailed) return 'provisioned';
  if (steps.length === 0) return 'pending';
  return 'partial';
}

// ── Manual replay (called by admin endpoint) ──────────────────────────

export async function replayProvisioning(quoteNumber: string): Promise<void> {
  const quote = await prisma.quote.findUnique({ where: { quoteNumber } });
  if (!quote) throw new Error(`Quote ${quoteNumber} not found`);
  // Reset failed steps to pending so runStep will retry them.
  await prisma.cwProvisioningStep.updateMany({
    where: { quoteId: quote.id, status: 'failed' },
    data: { status: 'pending' },
  });
  // Re-run full pipeline. Successful steps short-circuit via runStep's resume.
  // Lazy import to dodge circular: quote.service imports this module too.
  const { getQuote } = await import('./quote.service.js');
  const quoteData = await getQuote(quoteNumber);
  await onPaymentCompleted(quoteData);
}

/** Reset every CW-side state on a quote and re-run the entire orchestration
 *  from scratch (onQuoteCreated then onPaymentCompleted). Used to recover
 *  quotes whose initial run happened in CW_DRY_RUN mode and now need real
 *  CW objects, or to clean up after an aborted test. Also marks the quote
 *  as paid in the local DB without consulting AP.
 */
export async function reprovisionFromScratch(quoteNumber: string): Promise<{
  cwQuoteCreated: CwQuoteCreatedResult;
  cwPaymentCompleted: CwPaymentCompletedResult;
}> {
  const quote = await prisma.quote.findUnique({ where: { quoteNumber } });
  if (!quote) throw new Error(`Quote ${quoteNumber} not found`);

  // Wipe every CW-side stamp on the quote + delete the per-step state so
  // runStep starts from scratch instead of resuming with sentinel ids.
  await prisma.$transaction([
    prisma.cwProvisioningStep.deleteMany({ where: { quoteId: quote.id } }),
    prisma.quote.update({
      where: { id: quote.id },
      data: {
        cwCompanyId: null,
        cwContactId: null,
        cwOpportunityId: null,
        cwAgreementId: null,
        cwProjectId: null,
        provisioningStatus: 'pending',
      },
    }),
  ]);

  const { getQuote } = await import('./quote.service.js');

  // Re-run onQuoteCreated. Persist the returned ids on the quote so
  // onPaymentCompleted's cwCompanyId guard sees them.
  let quoteData = await getQuote(quoteNumber);
  const cwQuoteCreated = await onQuoteCreated(quoteData);
  if (cwQuoteCreated.cwCompanyId || cwQuoteCreated.cwContactId || cwQuoteCreated.cwOpportunityId) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        cwCompanyId: cwQuoteCreated.cwCompanyId ?? null,
        cwContactId: cwQuoteCreated.cwContactId ?? null,
        cwOpportunityId: cwQuoteCreated.cwOpportunityId ?? null,
      },
    });
  }

  // Re-fetch quote so the orchestrator sees the freshly persisted ids.
  quoteData = await getQuote(quoteNumber);
  const cwPaymentCompleted = await onPaymentCompleted(quoteData);

  // Persist agreement/project ids onto the Quote row for the admin UI to
  // surface without having to drill into cw_provisioning_steps.
  if (cwPaymentCompleted.cwAgreementId || cwPaymentCompleted.cwProjectId) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        cwAgreementId: cwPaymentCompleted.cwAgreementId ?? null,
        cwProjectId: cwPaymentCompleted.cwProjectId ?? null,
      },
    });
  }

  return { cwQuoteCreated, cwPaymentCompleted };
}
