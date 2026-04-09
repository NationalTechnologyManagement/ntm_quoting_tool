import { env } from '../config/env.js';
import type { QuoteData } from '@ntm/shared';

// ── CW Reference IDs ────────────────────────────────────────────────
// These map to your ConnectWise Manage instance configuration

const CW_IDS = {
  companyType: { prospect: 26, customer: 40 },
  companyStatus: { active: 1 },
  oppStatus: { open: 1, won: 2 },
  oppStage: { quoted: 5, won: 6 },
  oppType: { recurringRevenue: 13 },
  location: { ntm: 11 },
  department: { services: 1 },
  billingCycle: { monthly: 2 },
  billingTerms: { net30: 1 },
  // Map package names to CW agreement type IDs
  agreementTypes: {
    'Essentials': 36,
    'SafeSecure': 37,
    'SafeSecure Plus': 38,
  } as Record<string, number>,
};

// ── CW API Client ───────────────────────────────────────────────────

function isCWConfigured(): boolean {
  return !!(env.CW_COMPANY_ID && env.CW_PUBLIC_KEY && env.CW_PRIVATE_KEY && env.CW_CLIENT_ID);
}

async function cwFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const credentials = Buffer.from(
    `${env.CW_COMPANY_ID}+${env.CW_PUBLIC_KEY}:${env.CW_PRIVATE_KEY}`,
  ).toString('base64');

  return fetch(`${env.CW_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      clientId: env.CW_CLIENT_ID!,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// ── Company ─────────────────────────────────────────────────────────

export async function findOrCreateCompany(
  customer: QuoteData['customer'],
): Promise<{ companyId: number; siteId: number } | null> {
  if (!isCWConfigured()) {
    console.warn('[CW] ConnectWise not configured — skipping company creation');
    return null;
  }

  try {
    // Search for existing company by name
    const searchRes = await cwFetch(
      `/company/companies?conditions=name='${customer.businessName.replace(/'/g, "''")}'&pageSize=1`,
    );

    if (searchRes.ok) {
      const companies = await searchRes.json();
      if (companies.length > 0) {
        const company = companies[0];
        const siteId = company.defaultContact?.site?.id || company.site?.id || 0;
        console.log(`[CW] Found existing company: ${company.name} (id: ${company.id})`);
        return { companyId: company.id, siteId };
      }
    }

    // Create new company (site.name is required by CW)
    const identifier = customer.businessName
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 25);

    const createRes = await cwFetch('/company/companies', {
      method: 'POST',
      body: JSON.stringify({
        name: customer.businessName,
        identifier,
        status: { id: CW_IDS.companyStatus.active },
        types: [{ id: CW_IDS.companyType.prospect }],
        phoneNumber: customer.phone,
        addressLine1: customer.address,
        site: { name: 'Main' },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(`[CW] Company creation failed (${createRes.status}): ${text}`);
      return null;
    }

    const company = await createRes.json();
    console.log(`[CW] Created company: ${company.name} (id: ${company.id})`);
    return { companyId: company.id, siteId: company.site?.id || 0 };
  } catch (error) {
    console.error('[CW] Company creation error:', error);
    return null;
  }
}

// ── Contact ─────────────────────────────────────────────────────────

export async function createContact(
  customer: QuoteData['customer'],
  companyId: number,
): Promise<number | null> {
  if (!isCWConfigured()) return null;

  try {
    const nameParts = customer.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const res = await cwFetch('/company/contacts', {
      method: 'POST',
      body: JSON.stringify({
        firstName,
        lastName,
        company: { id: companyId },
        communicationItems: [
          {
            type: { id: 1, name: 'Email' },
            value: customer.email,
            communicationType: 'Email',
            defaultFlag: true,
          },
          {
            type: { id: 2, name: 'Phone' },
            value: customer.phone,
            communicationType: 'Phone',
            defaultFlag: true,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[CW] Contact creation failed (${res.status}): ${text}`);
      return null;
    }

    const contact = await res.json();
    console.log(`[CW] Created contact: ${firstName} ${lastName} (id: ${contact.id})`);
    return contact.id;
  } catch (error) {
    console.error('[CW] Contact creation error:', error);
    return null;
  }
}

// ── Opportunity ─────────────────────────────────────────────────────

export async function createOpportunity(
  quote: QuoteData,
  companyId: number,
  contactId: number,
): Promise<number | null> {
  if (!isCWConfigured()) return null;

  try {
    const expectedClose = new Date();
    expectedClose.setDate(expectedClose.getDate() + 30);

    // Get first active sales member for primarySalesRep
    let salesRepId: number | undefined;
    try {
      const membersRes = await cwFetch('/system/members?pageSize=1&conditions=inactiveFlag=false and salesDefaultFlag=true');
      if (membersRes.ok) {
        const members = await membersRes.json();
        salesRepId = members[0]?.id;
      }
      if (!salesRepId) {
        // Fallback: get any active non-system member
        const fallbackRes = await cwFetch('/system/members?pageSize=5&conditions=inactiveFlag=false');
        if (fallbackRes.ok) {
          const members = await fallbackRes.json();
          salesRepId = members.find((m: any) => m.firstName && !['ConnectWise', 'CalendarSync', 'SimpleSAT', 'BrightGauge', 'ConnectBooster'].includes(m.firstName))?.id;
        }
      }
    } catch { /* use undefined */ }

    const res = await cwFetch('/sales/opportunities', {
      method: 'POST',
      body: JSON.stringify({
        name: `Quoting Tool - ${quote.customer.businessName} - ${quote.selectedPackage.name}`,
        company: { id: companyId },
        contact: { id: contactId },
        type: { id: CW_IDS.oppType.recurringRevenue },
        status: { id: CW_IDS.oppStatus.open },
        stage: { id: CW_IDS.oppStage.quoted },
        source: 'Quote Builder',
        expectedCloseDate: `${expectedClose.getFullYear()}-${String(expectedClose.getMonth() + 1).padStart(2, '0')}-${String(expectedClose.getDate()).padStart(2, '0')}T00:00:00Z`,
        ...(salesRepId ? { primarySalesRep: { id: salesRepId } } : {}),
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

    if (!res.ok) {
      const text = await res.text();
      console.error(`[CW] Opportunity creation failed (${res.status}): ${text}`);
      return null;
    }

    const opp = await res.json();
    console.log(`[CW] Created opportunity: ${opp.name} (id: ${opp.id})`);
    return opp.id;
  } catch (error) {
    console.error('[CW] Opportunity creation error:', error);
    return null;
  }
}

// ── Mark Opportunity Won ────────────────────────────────────────────

export async function markOpportunityWon(opportunityId: number): Promise<void> {
  if (!isCWConfigured()) return;

  try {
    const res = await cwFetch(`/sales/opportunities/${opportunityId}`, {
      method: 'PATCH',
      body: JSON.stringify([
        { op: 'replace', path: '/status', value: { id: CW_IDS.oppStatus.won } },
        { op: 'replace', path: '/stage', value: { id: CW_IDS.oppStage.won } },
        { op: 'replace', path: '/closedDate', value: new Date().toISOString().slice(0, 10) },
      ]),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[CW] Mark opportunity won failed (${res.status}): ${text}`);
    } else {
      console.log(`[CW] Opportunity ${opportunityId} marked as won`);
    }
  } catch (error) {
    console.error('[CW] Mark opportunity won error:', error);
  }
}

// ── Update Company to Customer ──────────────────────────────────────

export async function updateCompanyToCustomer(companyId: number): Promise<void> {
  if (!isCWConfigured()) return;

  try {
    const res = await cwFetch(`/company/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify([
        { op: 'replace', path: '/types', value: [{ id: CW_IDS.companyType.customer }] },
      ]),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[CW] Update company type failed (${res.status}): ${text}`);
    } else {
      console.log(`[CW] Company ${companyId} updated to Customer type`);
    }
  } catch (error) {
    console.error('[CW] Update company type error:', error);
  }
}

// ── Project ─────────────────────────────────────────────────────────

export async function createProject(
  quote: QuoteData,
  companyId: number,
  contactId: number,
): Promise<number | null> {
  if (!isCWConfigured()) return null;

  try {
    const res = await cwFetch('/project/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: `Onboarding - ${quote.customer.businessName}`,
        company: { id: companyId },
        contact: { id: contactId },
        description: [
          `Package: ${quote.selectedPackage.name}`,
          `Users: ${quote.customer.userCount}`,
          `Locations: ${quote.customer.locationCount}`,
          `Quote: ${quote.quoteNumber}`,
          `Order: ${(quote as any).orderNumber || 'N/A'}`,
          `Addons: ${quote.selectedAddons.map((a) => a.name).join(', ') || 'None'}`,
        ].join('\n'),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[CW] Project creation failed (${res.status}): ${text}`);
      return null;
    }

    const project = await res.json();
    console.log(`[CW] Created project: ${project.name} (id: ${project.id})`);
    return project.id;
  } catch (error) {
    console.error('[CW] Project creation error:', error);
    return null;
  }
}

// ── Agreement ───────────────────────────────────────────────────────

export async function createAgreement(
  quote: QuoteData,
  companyId: number,
  contactId: number,
): Promise<number | null> {
  if (!isCWConfigured()) return null;

  try {
    const packageName = quote.selectedPackage.name;
    const agreementTypeId = CW_IDS.agreementTypes[packageName];

    if (!agreementTypeId) {
      console.warn(`[CW] No agreement type mapping for package "${packageName}"`);
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);

    const res = await cwFetch('/finance/agreements', {
      method: 'POST',
      body: JSON.stringify({
        name: `${packageName} - ${quote.customer.businessName}`,
        type: { id: agreementTypeId },
        company: { id: companyId },
        contact: { id: contactId },
        startDate: today,
        noEndingDateFlag: true,
        billAmount: quote.totals.recurringCosts,
        billCycleId: CW_IDS.billingCycle.monthly,
        billTermsId: CW_IDS.billingTerms.net30,
        billStartDate: today,
        location: { id: CW_IDS.location.ntm },
        department: { id: CW_IDS.department.services },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[CW] Agreement creation failed (${res.status}): ${text}`);
      return null;
    }

    const agreement = await res.json();
    console.log(`[CW] Created agreement: ${agreement.name} (id: ${agreement.id})`);

    // Add agreement additions for recurring addons
    for (const addon of quote.selectedAddons) {
      if (addon.pricingType !== 'one-time-only' && addon.recurringPrice && addon.recurringPrice > 0) {
        try {
          await cwFetch(`/finance/agreements/${agreement.id}/additions`, {
            method: 'POST',
            body: JSON.stringify({
              description: addon.name,
              quantity: addon.quantity,
              unitPrice: addon.recurringPrice,
              effectiveDate: today,
              billCustomer: 'Billable',
            }),
          });
        } catch (e) {
          console.error(`[CW] Agreement addition failed for "${addon.name}":`, e);
        }
      }
    }

    return agreement.id;
  } catch (error) {
    console.error('[CW] Agreement creation error:', error);
    return null;
  }
}

// ── Add Opportunity Note ────────────────────────────────────────────

export async function addOpportunityNote(
  opportunityId: number,
  text: string,
): Promise<void> {
  if (!isCWConfigured()) return;

  try {
    await cwFetch(`/sales/opportunities/${opportunityId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('[CW] Add opportunity note error:', error);
  }
}

// ── Orchestration: Quote Created ────────────────────────────────────

export async function onQuoteCreated(
  quote: QuoteData,
): Promise<{ cwCompanyId?: number; cwContactId?: number; cwOpportunityId?: number }> {
  if (!isCWConfigured()) return {};

  const result: { cwCompanyId?: number; cwContactId?: number; cwOpportunityId?: number } = {};

  const companyResult = await findOrCreateCompany(quote.customer);
  if (!companyResult) return result;
  result.cwCompanyId = companyResult.companyId;

  const contactId = await createContact(quote.customer, companyResult.companyId);
  if (contactId) result.cwContactId = contactId;

  const oppId = await createOpportunity(
    quote,
    companyResult.companyId,
    contactId || 0,
  );
  if (oppId) result.cwOpportunityId = oppId;

  return result;
}

// ── Orchestration: Payment Completed ────────────────────────────────

export async function onPaymentCompleted(quote: QuoteData): Promise<{
  cwProjectId?: number;
  cwAgreementId?: number;
}> {
  if (!isCWConfigured()) return {};

  const result: { cwProjectId?: number; cwAgreementId?: number } = {};

  // Mark opportunity as won
  if (quote.cwOpportunityId) {
    await markOpportunityWon(quote.cwOpportunityId);
    await addOpportunityNote(
      quote.cwOpportunityId,
      `Payment received via Alternative Payments - Order ${(quote as any).orderNumber || quote.quoteNumber}`,
    );
  }

  // Update company type to Customer
  if (quote.cwCompanyId) {
    await updateCompanyToCustomer(quote.cwCompanyId);
  }

  // Create project
  if (quote.cwCompanyId) {
    const projectId = await createProject(
      quote,
      quote.cwCompanyId,
      quote.cwContactId || 0,
    );
    if (projectId) result.cwProjectId = projectId;
  }

  // Create agreement
  if (quote.cwCompanyId) {
    const agreementId = await createAgreement(
      quote,
      quote.cwCompanyId,
      quote.cwContactId || 0,
    );
    if (agreementId) result.cwAgreementId = agreementId;
  }

  return result;
}
