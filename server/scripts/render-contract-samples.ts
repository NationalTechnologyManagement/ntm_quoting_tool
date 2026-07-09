// Render sample contract PDFs from fixture data — no DB, no CW, no email.
//
// Usage (from server/):
//   npx tsx scripts/render-contract-samples.ts [outDir]
//
// Writes three PDFs to outDir (default ./contract-samples):
//   1. new-customer.pdf        — full onboarding contract (package + addons)
//   2. existing-customer.pdf   — Service Addition variant (phones for an
//                                existing CW customer, custom items, no pkg)
//   3. custom-only.pdf         — fully stripped quote: no package, custom
//                                line items only
//
// Use this to eyeball formatting changes (page breaks, spacing, print
// colors) without touching a real quote.

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildContractHtml } from '../src/templates/contract.js';
import { generatePdf } from '../src/services/pdf.service.js';
import type { QuoteData } from '@ntm/shared';

const outDir = process.argv[2] || join(process.cwd(), 'contract-samples');

const baseCustomer = {
  name: 'Jordan Sample',
  email: 'jordan@sampleco.test',
  phone: '(248) 555-0100',
  businessName: 'Sample Manufacturing Co',
  address: '4050 W Maple Rd, Bloomfield Hills, MI 48301',
  userCount: 12,
  webUserCount: 4,
  locationCount: 2,
};

const sampleTerms = {
  version: '2.1',
  id: 'terms-sample',
  url: 'https://quote.trustntm.com/terms',
  content: [
    '# Master Services Agreement',
    '## SERVICES & SUPPORT',
    'Provider shall deliver the managed services described in the attached quote.',
    '- 8x5 helpdesk support',
    '- Proactive monitoring and patching',
    '### Response Targets',
    '| Priority | Response |',
    '| Critical | 1 hour |',
    '| Normal | Next business day |',
    '## PAYMENT',
    'Invoices are issued on the 1st of every month, Net 30.',
    '> Late payments accrue 1.5% monthly interest.',
  ].join('\n'),
};

const newCustomerQuote: QuoteData = {
  quoteNumber: 'QT-SAMPLE-0001',
  customer: baseCustomer,
  selectedPackage: {
    id: 'pkg-sample',
    name: 'SafeSecure Protect',
    pricePerUser: 125,
    pricePerUserF3: 45,
    pricePerLocation: 199,
    frequency: 'monthly',
    features: [],
    featureGroups: [
      { category: 'Support', items: ['8x5 Helpdesk', 'Remote support', 'On-site as needed'] },
      { category: 'Security', items: ['EDR on every endpoint', 'Email filtering', 'MFA rollout', 'Security awareness training'] },
      { category: 'Microsoft 365', items: ['Business Premium licensing', 'Teams voice-ready', 'SharePoint backup'] },
    ],
    agreementMonths: 36,
    calculatedPrice: 125 * 12 + 45 * 4 + 199 * 2,
  },
  selectedAddons: [
    {
      id: 'addon-1',
      name: 'Microsoft 365 Backup',
      description: 'Daily backup of Exchange, SharePoint, OneDrive, Teams',
      price: 5,
      quantity: 16,
      frequency: 'monthly',
      totalPrice: 80,
      pricingType: 'recurring-only',
      recurringPrice: 5,
      recurringFrequency: 'monthly',
      setupPrice: null,
      totalRecurringCost: 80,
      totalSetupCost: 0,
    },
  ],
  customItems: [],
  onboarding: { userCount: 12, costPerUser: 341, totalCost: 4156, discount: 0, finalCost: 4156 },
  appliedPromoCodes: [],
  totals: {
    onboardingCost: 4156,
    oneTimeCosts: 0,
    recurringCosts: 2158,
    discount: 0,
    grandTotal: 6314,
    recurringFrequency: 'monthly',
  },
  terms: sampleTerms,
  status: 'sent',
  timestamp: new Date().toISOString(),
};

const existingCustomerQuote: QuoteData = {
  ...newCustomerQuote,
  quoteNumber: 'QT-SAMPLE-0002',
  isExistingCustomer: true,
  selectedPackage: null,
  selectedAddons: [
    {
      id: 'addon-voip',
      name: 'Teams Phone (VoIP)',
      description: 'Cloud phone system seat with calling plan',
      price: 20,
      quantity: 12,
      frequency: 'monthly',
      totalPrice: 240,
      pricingType: 'recurring-only',
      recurringPrice: 20,
      recurringFrequency: 'monthly',
      setupPrice: null,
      totalRecurringCost: 240,
      totalSetupCost: 0,
    },
  ],
  customItems: [
    {
      id: 'ci-1',
      name: 'Yealink MP54 Desk Phones',
      description: 'Teams-certified desk phone, drop-shipped and provisioned',
      quantity: 12,
      recurringPrice: null,
      recurringFrequency: null,
      oneTimePrice: 189,
      cwProductId: 4321,
    },
    {
      id: 'ci-2',
      name: 'Phone system cutover (after-hours)',
      description: 'Number porting, call-flow build, user training',
      quantity: 1,
      recurringPrice: null,
      recurringFrequency: null,
      oneTimePrice: 1200,
      cwProductId: null,
    },
  ],
  onboarding: { userCount: 0, costPerUser: 0, totalCost: 0, discount: 0, finalCost: 0 },
  totals: {
    onboardingCost: 0,
    oneTimeCosts: 189 * 12 + 1200,
    recurringCosts: 240,
    discount: 0,
    grandTotal: 189 * 12 + 1200 + 240,
    recurringFrequency: 'monthly',
  },
};

const customOnlyQuote: QuoteData = {
  ...newCustomerQuote,
  quoteNumber: 'QT-SAMPLE-0003',
  selectedPackage: null,
  selectedAddons: [],
  customItems: [
    {
      id: 'ci-1',
      name: 'Server rack relocation',
      description: 'Weekend move of the on-prem rack to the new office',
      quantity: 1,
      recurringPrice: null,
      recurringFrequency: null,
      oneTimePrice: 3500,
    },
  ],
  onboarding: { userCount: 0, costPerUser: 0, totalCost: 0, discount: 0, finalCost: 0 },
  totals: {
    onboardingCost: 0,
    oneTimeCosts: 3500,
    recurringCosts: 0,
    discount: 0,
    grandTotal: 3500,
    recurringFrequency: 'monthly',
  },
};

async function main() {
  mkdirSync(outDir, { recursive: true });
  const samples: Array<[string, QuoteData]> = [
    ['new-customer.pdf', newCustomerQuote],
    ['existing-customer.pdf', existingCustomerQuote],
    ['custom-only.pdf', customOnlyQuote],
  ];
  for (const [file, quote] of samples) {
    const html = buildContractHtml(quote);
    const pdf = await generatePdf(html);
    const path = join(outDir, file);
    writeFileSync(path, pdf);
    console.log(`wrote ${path} (${(pdf.length / 1024).toFixed(0)} KB)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
