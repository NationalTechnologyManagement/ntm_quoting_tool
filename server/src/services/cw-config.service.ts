import { prisma } from '../config/prisma.js';

// ── Config keys ───────────────────────────────────────────────────────
// Mirror the layout in docs/cw-reference-ids.md. Add a key here, then add
// a default value (or null) to DEFAULTS below. The seed will upsert
// defaults idempotently. The loader treats numeric-looking values as ints.
//
// Convention: dotted keys, lower-camel values inside each section.

export const CW_CONFIG_KEYS = [
  // ── Company ──
  'company.typeProspectId',
  'company.typeCustomerId',
  'company.statusActiveId',
  'company.marketId',

  // ── Communication item types ──
  'comm.emailTypeId',
  'comm.phoneTypeId',

  // ── Opportunity ──
  'opportunity.typeRecurringId',
  'opportunity.statusOpenId',
  'opportunity.statusWonId',
  'opportunity.stageQuotedId',
  'opportunity.stageWonId',
  'opportunity.defaultSalesRepMemberId',

  // ── Agreement defaults ──
  'agreement.defaultTaxCodeId',
  'agreement.billTermsId',
  'agreement.currencyId',
  'agreement.departmentId',
  'agreement.locationId',
  'agreement.billCycleId',

  // ── Project ──
  'project.typeId',
  'project.templateId',
  'project.boardId',
  'project.defaultManagerMemberId',
  'project.billingMethod',         // enum string, not int
  'project.defaultDurationDays',

  // ── Custom field IDs (cross-reference back to Quote) ──
  'customField.companyQuoteId',
  'customField.agreementQuoteId',
  'customField.projectAgreementNumber',
] as const;

export type CwConfigKey = (typeof CW_CONFIG_KEYS)[number];

// Defaults audited 2026-04-27 against NTM production CW (v2025.1.10573).
// See docs/cw-reference-ids.md for the source GET behind every value and any
// outstanding prerequisites (custom fields, package mapping, blocked endpoints).
// String "null" sentinel = explicitly unset (loader returns undefined for those).
export const DEFAULTS: Record<CwConfigKey, string> = {
  // Company defaults — confirmed via /company/companies/types and /statuses
  'company.typeProspectId': '26',  // "Prospect"
  'company.typeCustomerId': '40',  // "Customer"
  'company.statusActiveId': '1',   // "Active"
  'company.marketId': 'null',      // optional; 24 markets available, leave unset

  // Communication item types — confirmed via /company/communicationTypes
  'comm.emailTypeId': '1',  // "Email - Work"
  'comm.phoneTypeId': '2',  // "Phone - Direct"

  // Opportunity reference IDs — confirmed via /sales/opportunities/* and /sales/stages
  'opportunity.typeRecurringId': '13',          // "Recurring Revenue"
  'opportunity.statusOpenId': '1',              // "1. Open"
  'opportunity.statusWonId': '2',               // "3. Won"
  'opportunity.stageQuotedId': '5',             // "4. Quoted"
  'opportunity.stageWonId': '6',                // "6. Won"
  'opportunity.defaultSalesRepMemberId': '155', // Kelly Siegel — only human in Sales dept

  // Agreement defaults — most confirmed; location/department blocked by API role
  'agreement.defaultTaxCodeId': '13',  // "Out of State" — safe single default
  'agreement.billTermsId': '1',        // "Net 30 days"
  'agreement.currencyId': '7',         // USD
  'agreement.departmentId': '1',       // "Services" (observed on existing project)
  'agreement.locationId': '11',        // "National Technology Management" (observed)
  'agreement.billCycleId': '2',        // Monthly (legacy)

  // Project — all five confirmed
  'project.typeId': '8',                    // "Customer Onboarding"
  'project.templateId': '2',                // "Client Onboarding Template"
  'project.boardId': '20',                  // "Projects" (only board with projectFlag=true)
  'project.defaultManagerMemberId': '165',  // Kenneth Phillips (kphillips)
  'project.billingMethod': 'FixedFee',
  'project.defaultDurationDays': '30',

  // Custom fields — none exist; ops must create in CW first
  'customField.companyQuoteId': 'null',
  'customField.agreementQuoteId': 'null',
  'customField.projectAgreementNumber': 'null',
};

// ── In-memory cache ───────────────────────────────────────────────────

let cache: Map<string, string> | null = null;

function parseValue(raw: string | undefined): number | string | undefined {
  if (raw === undefined || raw === 'null' || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && /^-?\d+$/.test(raw) ? n : raw;
}

async function loadCache(): Promise<Map<string, string>> {
  const rows = await prisma.cwConfig.findMany();
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.key, row.value);
  // Fall back to defaults for missing keys so a fresh deploy isn't broken.
  for (const k of CW_CONFIG_KEYS) {
    if (!map.has(k)) map.set(k, DEFAULTS[k]);
  }
  cache = map;
  return map;
}

export async function getCwConfig(): Promise<Record<CwConfigKey, number | string | undefined>> {
  const map = cache ?? (await loadCache());
  const out = {} as Record<CwConfigKey, number | string | undefined>;
  for (const k of CW_CONFIG_KEYS) out[k] = parseValue(map.get(k));
  return out;
}

export async function getCwConfigRaw(): Promise<Array<{ key: string; value: string; notes: string | null }>> {
  const rows = await prisma.cwConfig.findMany({ orderBy: { key: 'asc' } });
  // Ensure every known key shows up in admin UI even if never persisted.
  const byKey = new Map(rows.map((r) => [r.key, r] as const));
  return CW_CONFIG_KEYS.map((k) => {
    const r = byKey.get(k);
    return r
      ? { key: r.key, value: r.value, notes: r.notes }
      : { key: k, value: DEFAULTS[k], notes: null };
  });
}

export async function setCwConfig(key: CwConfigKey, value: string, notes?: string | null): Promise<void> {
  await prisma.cwConfig.upsert({
    where: { key },
    update: { value, notes: notes ?? null },
    create: { key, value, notes: notes ?? null },
  });
  cache = null;
}

export function isCwConfigKey(k: string): k is CwConfigKey {
  return (CW_CONFIG_KEYS as readonly string[]).includes(k);
}

export function invalidateCwConfigCache(): void {
  cache = null;
}

// Keys that the orchestrator actually depends on to complete provisioning.
// Used by the admin UI to surface "you still need to set X" warnings.
// Custom-field keys are intentionally NOT in this list — the crossref step
// silently skips when they're unset, so they're optional. Set them once the
// "Quote ID" custom fields are created on Company / Agreement / Project in CW.
export const REQUIRED_KEYS_FOR_PROVISIONING: CwConfigKey[] = [
  'project.typeId',
  'project.templateId',
  'project.boardId',
  'project.defaultManagerMemberId',
  'opportunity.defaultSalesRepMemberId',
  'agreement.currencyId',
];
