import type { Package, Addon, PromoCode, TermsContent } from './types.js';

// NTM onboarding pricing rule:
// Onboarding fee = 2 × calculated monthly service total (per-user × users +
// per-location × locations). Always waived when bought through this portal —
// the entire purpose of online self-signup is to skip the onboarding fee.
// (Originally limited to 36-month agreements per the docs; broadened by NTM
// to all online quotes regardless of term.)
export const ONBOARDING_FEE_MULTIPLIER = 2;
export const ONBOARDING_WAIVED_FOR_PORTAL = true;

// Legacy: kept for backwards compatibility with old quotes that snapshotted a
// flat per-user onboarding cost. New quotes use computeOnboardingFee().
export const ONBOARDING_COST_PER_USER = 200;

export const QUOTE_VALIDITY_DAYS = 30;

/** Compute base onboarding fee for a given package + sizing. Pass
 *  { waive: false } from lite/lead-gen contexts to charge the full fee.
 *  Pass { webUserCount } to fold the F3 (Web User) tier into the recurring
 *  base — without it, only Desktop users + locations contribute. */
export function computeOnboardingFee(
  pkg: Pick<Package, 'pricePerUser' | 'pricePerUserF3' | 'pricePerLocation' | 'agreementMonths'>,
  userCount: number,
  locationCount: number,
  options?: { waive?: boolean; webUserCount?: number },
): { base: number; waived: boolean; final: number } {
  const webUserCount = options?.webUserCount ?? 0;
  const monthly =
    pkg.pricePerUser * userCount +
    (pkg.pricePerUserF3 ?? 0) * webUserCount +
    pkg.pricePerLocation * locationCount;
  const base = monthly * ONBOARDING_FEE_MULTIPLIER;
  // Default behavior: all online portal quotes get the waiver. The lite
  // quoting tool overrides this so the customer sees the real onboarding
  // cost in their estimate before a sales rep follows up.
  const waived = options?.waive ?? ONBOARDING_WAIVED_FOR_PORTAL;
  return { base, waived, final: waived ? 0 : base };
}

// Real NTM pricing audited 2026-04-27 from ntm-sales-kb-upload-only/.
// Features lifted from plan-comparison.csv. cwAgreementTypeId mapping reuses
// legacy CW agreement types (36/37/38), confirmed against NTM CW production.
export const defaultPackages: Package[] = [
  {
    id: 'package-1',
    name: 'Essentials',
    pricePerUser: 59,        // Desktop User (Business Premium)
    pricePerUserF3: 29,      // Web User (F3 — Web & Email Only)
    pricePerLocation: 300,
    frequency: 'monthly',
    agreementMonths: 0, // month-to-month
    features: [
      '8x5 business hours support (24x7 emergencies)',
      'Remote management & support',
      'Network operations center',
      'Antivirus + MDR + EDR',
      'DNS filtering',
      'Automated patching & software deployment',
    ],
    isBestValue: false,
    customerVisible: false, // hidden from public pricing per NTM
    cwAgreementTypeId: 36, // CW: "00791 Essentials Package"
    cwPerUserProductId: 1096,     // PERUSER0001-MRR Business Premium
    cwPerUserF3ProductId: 1118,   // PERUSER0005-MRR F3 (Web & Email Only)
    cwPerLocationProductId: 1099, // PERLOCATION0001-MRR
  },
  {
    id: 'package-2',
    name: 'SafeSecure',
    // Per CW catalog (PERUSER0002-MRR / PERLOCATION0002-MRR). Previous seed
    // value of $99/user was stale and disagreed with what CW invoices.
    pricePerUser: 119,
    pricePerUserF3: 29,
    pricePerLocation: 400,
    frequency: 'monthly',
    agreementMonths: 36,
    features: [
      'Everything in Essentials',
      'Vendor liaison',
      'Darkweb monitoring',
      'Mobile device management (MDM)',
      'Email encryption',
      'Microsoft 365 backups',
    ],
    isBestValue: true,
    customerVisible: true,
    cwAgreementTypeId: 37, // CW: "00792 SafeSecure Package"
    cwPerUserProductId: 1097,     // PERUSER0002-MRR Business Premium
    cwPerUserF3ProductId: 1119,   // PERUSER0006-MRR F3 (Web & Email Only)
    cwPerLocationProductId: 1245, // PERLOCATION0002-MRR
  },
  {
    id: 'package-3',
    name: 'SafeSecure Plus',
    // Per CW catalog (PERUSER0003-MRR). Previous seed was $149.
    pricePerUser: 179,
    pricePerUserF3: 59,
    pricePerLocation: 500,
    frequency: 'monthly',
    agreementMonths: 36,
    features: [
      'Everything in SafeSecure',
      '24x7 support included',
      'On-site support included',
      'Advanced threat protection',
    ],
    isBestValue: false,
    customerVisible: true,
    cwAgreementTypeId: 38, // CW: "00793 SafeSecure Plus Package"
    cwPerUserProductId: 1098,     // PERUSER0003-MRR Business Premium
    cwPerUserF3ProductId: 1120,   // PERUSER0007-MRR F3 (Web & Email Only)
    cwPerLocationProductId: 1246, // PERLOCATION0003-MRR
  },
];

// Real NTM addon catalog. Each row carries the real CW catalog product id
// (cwProductId) so postAdditions can create the Addition with the right SKU
// without ops having to fill them in manually post-deploy. IDs sourced from
// cw-id-finder/quote-catalog.md, audited 2026-05-12.
export const defaultAddons: Addon[] = [
  {
    id: 'addon-voice-voip',
    name: 'Voice Phone (VoIP)',
    description: 'Cloud VoIP phone line. Billed per phone line per month.',
    // Customer-facing price intentionally below the WHITELABEL0001-MRR
    // catalog rate ($30) — postAdditions posts each Addition with this
    // recurringPrice as the unitPrice, so CW invoices $20/line regardless
    // of the catalog default.
    price: 20,
    frequency: 'monthly',
    recurringPrice: 20,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
    cwProductId: 310, // WHITELABEL0001-MRR — SafeSecure Voice - Cloud User License
  },
  {
    id: 'addon-teams-phone',
    name: 'Microsoft Teams Phone',
    description: 'Microsoft Teams Phone licensing. Billed per user per month.',
    price: 15,
    frequency: 'monthly',
    recurringPrice: 15,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
    cwProductId: 1274, // MICROSOFT0057-MRR — SafeSecure Licensing - Microsoft Teams Premium
  },
  {
    id: 'addon-efax',
    name: 'eFaxing',
    description: 'Cloud fax service. Billed per fax line per month.',
    price: 25,
    frequency: 'monthly',
    recurringPrice: 25,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
    cwProductId: 792, // WHITELABEL0004-MRR — SafeSecure Voice - Cloud Efax License
  },
  {
    id: 'addon-m365-backups',
    name: 'Microsoft SaaS Backups',
    description: 'Infinite SaaS protection backups for Microsoft 365 (mail, OneDrive, SharePoint). Billed per mailbox per month.',
    price: 6,
    frequency: 'monthly',
    recurringPrice: 6,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
    cwProductId: 189, // DATTO0003-MRR — SafeSecure Protect Management - Infinite SaaS Protection
  },
  {
    id: 'addon-server-mgmt',
    name: 'Server Management per VM',
    description: 'Managed server services. Billed per managed virtual machine per month.',
    price: 175,
    frequency: 'monthly',
    recurringPrice: 175,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
    cwProductId: 204, // MANAGEDIT0004 — SafeSecure Server Management - Virtual Server
  },
];

export const defaultPromoCodes: PromoCode[] = [
  {
    id: 'promo-1',
    code: 'SAVE10',
    discount: 10,
    discountType: 'percentage',
    applyTo: 'one-time',
    active: true,
  },
  {
    id: 'promo-2',
    code: 'WELCOME20',
    discount: 20,
    discountType: 'percentage',
    applyTo: 'monthly',
    active: true,
  },
];

export const defaultTermsContent: Omit<TermsContent, 'id' | 'lastUpdated'> = {
  version: '1.0',
  content: `TERMS AND CONDITIONS

1. SERVICE AGREEMENT
This Agreement is entered into for a period of 36 months from the date of purchase. By signing this agreement, you commit to maintaining the service for the full 36-month term unless otherwise specified in the cancellation policy.

2. PRICING AND PAYMENT
- All pricing is as specified in your selected package
- Prices are per user and/or per location as indicated
- Monthly subscriptions are billed monthly in advance
- Annual subscriptions receive a discount and are billed annually in advance
- One-time fees are due at the time of purchase
- All prices are in USD and exclude applicable taxes

3. ONBOARDING
- Standard onboarding is included with all packages
- Onboarding fees, if applicable, are one-time charges
- Timeline for onboarding will be communicated upon purchase

4. CANCELLATION POLICY
- Early termination of the 36-month agreement may result in cancellation fees
- Written notice of 30 days is required for cancellation
- Refunds are not provided for unused time on prepaid subscriptions
- Some services may have minimum commitment periods

5. SERVICE LEVEL
- We strive to provide 99.9% uptime for all services
- Support is available during business hours (9 AM - 5 PM EST)
- Emergency support may be available depending on your package level

6. DATA AND PRIVACY
- Your data is stored securely and backed up regularly
- We comply with all applicable data protection regulations
- You retain ownership of all data you upload to our systems
- We will never sell or share your data with third parties without consent

7. LIMITATION OF LIABILITY
- Our liability is limited to the amount paid for services
- We are not responsible for indirect or consequential damages
- Service interruptions due to circumstances beyond our control are not grounds for refunds

8. MODIFICATIONS
- We reserve the right to modify these terms with 30 days notice
- Continued use of services after modifications constitutes acceptance
- Material changes will be communicated via email

9. ELECTRONIC SIGNATURE
By providing your electronic signature and agreeing to these terms, you acknowledge that your electronic signature is legally binding and equivalent to a handwritten signature.

10. CONTACT INFORMATION
For questions about these terms, please contact us at:
Email: sales@trustntm.com
Phone: (248) 658-0830

11. GOVERNING LAW
This agreement is governed by the laws of the State of Michigan and any disputes will be resolved in the courts of Michigan.`,
};

export const SERVICE_PROVIDER = {
  company: 'SR Partners LLC dba National Technology Management',
  contact: 'Kelly Siegel',
  email: 'sales@trustntm.com',
  phone: '(248) 658-0830',
  address: '30400 Telegraph Rd Ste 116, Bingham Farms MI 48025',
} as const;
