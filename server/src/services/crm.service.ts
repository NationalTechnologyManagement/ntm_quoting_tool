import type { LeadPayload, QuoteData } from '@ntm/shared';
import { cred } from './integration-credentials.service.js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

function isGHLConfigured(): boolean {
  return !!(cred('GHL_API_KEY'));
}

async function ghlFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${GHL_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cred('GHL_API_KEY')}`,
      Version: '2021-07-28',
      ...options.headers,
    },
  });
}

// ── Lead Creation (existing, for /api/leads route) ──────────────────

export async function createLead(payload: LeadPayload) {
  if (!isGHLConfigured()) {
    console.warn('[GHL] GoHighLevel API key not configured — skipping lead creation');
    return { success: true, skipped: true };
  }

  try {
    const response = await ghlFetch('/contacts/', {
      method: 'POST',
      body: JSON.stringify({
        firstName: payload.customer.name.split(' ')[0],
        lastName: payload.customer.name.split(' ').slice(1).join(' '),
        email: payload.customer.email,
        phone: payload.customer.phone,
        companyName: payload.customer.businessName,
        address1: payload.customer.address,
        locationId: cred('GHL_LOCATION_ID'),
        source: payload.source,
        tags: ['quote-builder', 'Protect'],
        customFields: [
          { key: 'userCount', field_value: String(payload.customer.userCount) },
          { key: 'locationCount', field_value: String(payload.customer.locationCount) },
          { key: 'selectedPackage', field_value: payload.selectedPackage?.name ?? 'None' },
          { key: 'referrerCode', field_value: payload.customer.referrerCode ?? '' },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[GHL] Contact creation error:', response.status, await response.text());
      return { success: false };
    }

    const data = await response.json();
    return { success: true, contactId: data.contact?.id };
  } catch (error) {
    console.error('[GHL] Contact creation error:', error);
    return { success: false };
  }
}

// ── Contact Lookup by Email ──────────────────────────────────────────

async function findContactByEmail(email: string): Promise<string | null> {
  try {
    // v2 duplicate search by email
    const res = await ghlFetch(
      `/contacts/search/duplicate?locationId=${cred('GHL_LOCATION_ID')}&email=${encodeURIComponent(email)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.contact?.id || null;
  } catch {
    return null;
  }
}

// ── Contact Creation/Update (for quote flow) ────────────────────────

export async function createOrUpdateContact(
  customer: QuoteData['customer'],
): Promise<string | null> {
  if (!isGHLConfigured()) return null;

  try {
    // Look up existing contact by email first
    const existingId = await findContactByEmail(customer.email);

    if (existingId) {
      // Update existing contact
      console.log(`[GHL] Found existing contact by email: ${customer.email} (id: ${existingId})`);
      const updateRes = await ghlFetch(`/contacts/${existingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: customer.name.split(' ')[0],
          lastName: customer.name.split(' ').slice(1).join(' '),
          phone: customer.phone,
          companyName: customer.businessName,
          address1: customer.address,
          tags: ['quote-builder', 'Protect'],
          customField: {
            userCount: customer.userCount,
            locationCount: customer.locationCount,
            referrerCode: customer.referrerCode ?? '',
          },
        }),
      });

      if (!updateRes.ok) {
        console.error('[GHL] Contact update error:', updateRes.status, await updateRes.text());
      }
      return existingId;
    }

    // Create new contact (v2 API)
    const response = await ghlFetch('/contacts/', {
      method: 'POST',
      body: JSON.stringify({
        firstName: customer.name.split(' ')[0],
        lastName: customer.name.split(' ').slice(1).join(' '),
        email: customer.email,
        phone: customer.phone,
        companyName: customer.businessName,
        address1: customer.address,
        locationId: cred('GHL_LOCATION_ID'),
        tags: ['quote-builder', 'Protect'],
        customFields: [
          { key: 'userCount', field_value: String(customer.userCount) },
          { key: 'locationCount', field_value: String(customer.locationCount) },
          { key: 'referrerCode', field_value: customer.referrerCode ?? '' },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[GHL] Contact creation error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const contactId = data.contact?.id;
    if (contactId) {
      console.log(`[GHL] Created new contact: ${customer.name} (id: ${contactId})`);
    }
    return contactId || null;
  } catch (error) {
    console.error('[GHL] Contact creation/update error:', error);
    return null;
  }
}

// ── Opportunity Management ──────────────────────────────────────────

export async function createOpportunity(
  quote: QuoteData,
  ghlContactId: string,
): Promise<string | null> {
  if (!isGHLConfigured()) return null;

  try {
    // Get pipelines (v2)
    const pipelineRes = await ghlFetch(`/opportunities/pipelines?locationId=${cred('GHL_LOCATION_ID')}`);
    if (!pipelineRes.ok) {
      console.error('[GHL] Failed to fetch pipelines:', pipelineRes.status);
      return null;
    }

    const pipelineData = await pipelineRes.json();
    const pipeline = pipelineData.pipelines?.[0];
    if (!pipeline) {
      console.error('[GHL] No pipelines found');
      return null;
    }

    const firstStage = pipeline.stages?.[0];

    // Create opportunity (v2)
    const response = await ghlFetch('/opportunities/', {
      method: 'POST',
      body: JSON.stringify({
        name: `${quote.customer.businessName} - ${quote.selectedPackage.name}`,
        pipelineId: pipeline.id,
        pipelineStageId: firstStage?.id,
        status: 'open',
        contactId: ghlContactId,
        monetaryValue: quote.totals.grandTotal,
        locationId: cred('GHL_LOCATION_ID'),
      }),
    });

    if (!response.ok) {
      console.error('[GHL] Opportunity creation error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const oppId = data.opportunity?.id;
    if (oppId) {
      console.log(`[GHL] Created opportunity: ${quote.customer.businessName} (id: ${oppId})`);
    }
    return oppId || null;
  } catch (error) {
    console.error('[GHL] Opportunity creation error:', error);
    return null;
  }
}

export async function updateOpportunityStatus(
  ghlOpportunityId: string,
  status: 'open' | 'won' | 'lost' | 'abandoned',
): Promise<void> {
  if (!isGHLConfigured()) return;

  try {
    const response = await ghlFetch(`/opportunities/${ghlOpportunityId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      console.error('[GHL] Opportunity status update error:', response.status, await response.text());
    } else {
      console.log(`[GHL] Opportunity ${ghlOpportunityId} status updated to: ${status}`);
    }
  } catch (error) {
    console.error('[GHL] Opportunity status update error:', error);
  }
}

// ── Apply Tags to Contact ───────────────────────────────────────────

export async function addTagsToContact(
  ghlContactId: string,
  tags: string[],
): Promise<void> {
  if (!isGHLConfigured() || tags.length === 0) return;

  try {
    const res = await ghlFetch(`/contacts/${ghlContactId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) {
      console.error('[GHL] Add tags error:', res.status, await res.text());
    }
  } catch (error) {
    console.error('[GHL] Add tags error:', error);
  }
}

// ── Lazy Lead Capture (lite quoting tool) ───────────────────────────
// Fired on every form change — upserts contact and applies the lead tag.
// Idempotent: createOrUpdateContact dedupes by email; tags add cleanly.
export async function captureLiteLead(
  customer: QuoteData['customer'],
): Promise<{ ghlContactId?: string }> {
  if (!isGHLConfigured()) return {};

  const contactId = await createOrUpdateContact(customer);
  if (!contactId) return {};

  await addTagsToContact(contactId, ['quote-tool-lite-lead']);
  return { ghlContactId: contactId };
}

// Called when the user clicks "Request Follow-up" — applies the submitted tag
// and a friendly note. Returns nothing; the route returns the booking URL.
export async function markLiteLeadSubmitted(
  quote: QuoteData,
): Promise<void> {
  if (!isGHLConfigured()) return;

  const ghlContactId =
    quote.ghlContactId ||
    (await createOrUpdateContact(quote.customer)) ||
    undefined;
  if (!ghlContactId) return;

  await addTagsToContact(ghlContactId, ['quote-tool-lite-submitted']);
  await addContactNote(
    ghlContactId,
    `Lite quote ${quote.quoteNumber} submitted — ${quote.selectedPackage.name} ($${quote.totals.grandTotal.toFixed(2)} ${quote.totals.recurringFrequency}). Calendar link sent.`,
  );
}

// ── Add Note to Contact ─────────────────────────────────────────────

export async function addContactNote(
  ghlContactId: string,
  body: string,
): Promise<void> {
  if (!isGHLConfigured()) return;

  try {
    await ghlFetch(`/contacts/${ghlContactId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body, userId: cred('GHL_LOCATION_ID') }),
    });
  } catch (error) {
    console.error('[GHL] Add contact note error:', error);
  }
}

// ── Orchestration: Quote Created ────────────────────────────────────

export async function onQuoteCreated(
  quote: QuoteData,
): Promise<{ ghlContactId?: string; ghlOpportunityId?: string }> {
  if (!isGHLConfigured()) return {};

  const result: { ghlContactId?: string; ghlOpportunityId?: string } = {};

  const contactId = await createOrUpdateContact(quote.customer);
  if (contactId) {
    result.ghlContactId = contactId;

    const oppId = await createOpportunity(quote, contactId);
    if (oppId) result.ghlOpportunityId = oppId;

    await addContactNote(contactId, `Quote ${quote.quoteNumber} created - ${quote.selectedPackage.name}`);
  }

  return result;
}

// ── Orchestration: Quote Emailed ────────────────────────────────────

export async function onQuoteEmailed(quote: QuoteData): Promise<void> {
  if (!isGHLConfigured()) return;

  if (quote.ghlContactId) {
    await addContactNote(quote.ghlContactId, `Quote ${quote.quoteNumber} emailed to customer`);
  }
}

// ── Orchestration: Payment Completed ────────────────────────────────

export async function onPaymentCompleted(quote: QuoteData): Promise<void> {
  if (!isGHLConfigured()) return;

  if (quote.ghlOpportunityId) {
    await updateOpportunityStatus(quote.ghlOpportunityId, 'won');
  }

  if (quote.ghlContactId) {
    // Tag drop on payment so the GHL automation (welcome sequence, etc.)
    // can fire off "quote-paid". The existing "quote-builder" + "Protect"
    // tags from contact creation stay in place.
    await addTagsToContact(quote.ghlContactId, ['quote-paid']);
    await addContactNote(
      quote.ghlContactId,
      `Payment received for quote ${quote.quoteNumber} - ${quote.selectedPackage.name}`,
    );
  }
}
