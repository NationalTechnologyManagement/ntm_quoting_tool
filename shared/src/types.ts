// ── Package & Addon Types ────────────────────────────────────────────

export interface FeatureGroup {
  category: string;
  items: string[];
}

export interface Package {
  id: string;
  name: string;
  // Desktop User price (Microsoft 365 Business Premium tier).
  pricePerUser: number;
  // Web User price (Microsoft 365 F3 / Web & Email Only tier).
  pricePerUserF3?: number;
  pricePerLocation: number;
  frequency: 'monthly' | 'annually' | 'one-time';
  features: string[]; // legacy flat list
  featureGroups?: FeatureGroup[]; // preferred: structured list grouped by category
  isBestValue?: boolean;
  // When false the package is hidden from the customer wizard. Admins still
  // see it, and historical quotes referencing it still resolve.
  customerVisible?: boolean;
  // CW agreement type id this package maps to. Required for `createAgreement`
  // to work; nullable so the schema doesn't break legacy rows during migration.
  cwAgreementTypeId?: number | null;
  // CW catalog product IDs for the package's recurring lines. postAdditions
  // posts one Agreement Addition per filled-in product: per-user × desktop
  // user count, per-user F3 × web user count, per-location × locationCount.
  cwPerUserProductId?: number | null;
  cwPerUserF3ProductId?: number | null;
  cwPerLocationProductId?: number | null;
  // Term length in months. 0 = month-to-month, 36 = 3-year, 60 = 5-year.
  // 36+ traditionally waives the onboarding fee per NTM policy.
  agreementMonths?: number;
}

export interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
  frequency: 'monthly' | 'annually' | 'one-time';
  active: boolean;
  recurringPrice?: number;
  recurringFrequency?: 'monthly' | 'annually';
  setupPrice?: number;
  pricingType: 'recurring-only' | 'one-time-only' | 'both';
  // CW catalog product id; required by Addition.product on POST.
  cwProductId?: number | null;
}

export interface SelectedAddon extends Addon {
  quantity: number;
  totalRecurringCost?: number;
  totalSetupCost?: number;
}

// ── Promo Codes ──────────────────────────────────────────────────────

export interface PromoCode {
  id: string;
  code: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  applyTo: 'one-time' | 'monthly' | 'onboarding';
  active: boolean;
}

// ── Customer ─────────────────────────────────────────────────────────

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  address: string;
  // Desktop User count (Business Premium). Historically just called
  // "userCount" — kept under the old name for backwards compat with
  // snapshotted quotes. Treated as the Desktop (Business Premium) tier.
  userCount: number;
  // Web User count (F3 / Web & Email Only). Optional; defaults to 0 so
  // pre-2026 quotes that didn't track this field still resolve.
  webUserCount?: number;
  locationCount: number;
  referrerCode?: string;
}

// ── Terms ────────────────────────────────────────────────────────────

export interface TermsContent {
  id: string;
  version: string;
  content: string;
  lastUpdated: string;
}

// ── Quote ────────────────────────────────────────────────────────────

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'checkout_pending'
  | 'paid'
  | 'expired';

export interface QuoteTotals {
  onboardingCost: number;
  oneTimeCosts: number;
  recurringCosts: number;
  discount: number;
  grandTotal: number;
  recurringFrequency: string;
}

export interface QuoteAgreement {
  signedBy: string;
  email: string;
  agreedToTerms: boolean;
  termsVersion: string;
  termsId: string;
  termsUrl: string;
  termsContent: string;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
  // Optional rasterized handwritten signature (PNG data URL). When present
  // the contract renders this image in the client signature spot instead of
  // the typed cursive name. `signedBy` is still required (typed legal name).
  signatureImage?: string;
}

export interface QuoteSelectedPackage {
  id: string;
  name: string;
  pricePerUser: number;
  pricePerUserF3?: number;
  pricePerLocation: number;
  frequency: string;
  features: string[];
  // Structured catalog snapshot. Older quotes only carry the flat
  // `features` array; new code reads featureGroups when present and
  // falls back to features otherwise.
  featureGroups?: FeatureGroup[];
  // Snapshotted at quote-creation so historical quotes keep their term even
  // if an admin retunes the source package later. 0 = month-to-month,
  // 36 = 3-year, 60 = 5-year.
  agreementMonths?: number;
  calculatedPrice: number;
}

export interface QuoteSelectedAddon {
  id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  frequency: string;
  totalPrice: number;
  pricingType: 'recurring-only' | 'one-time-only' | 'both';
  recurringPrice: number | null;
  recurringFrequency: string | null;
  setupPrice: number | null;
  totalRecurringCost: number;
  totalSetupCost: number;
}

export interface QuoteOnboarding {
  userCount: number;
  costPerUser: number;
  totalCost: number;
  discount: number;
  finalCost: number;
}

// Freeform line item added by NTM staff from the admin quote detail page.
// Not part of the package/addon catalog. Recurring custom items roll into
// the CW agreement as Additions (when cwProductId is set); one-time items
// are charged on the upfront AP invoice.
export interface QuoteCustomItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  recurringPrice?: number | null;
  recurringFrequency?: 'monthly' | 'annually' | null;
  oneTimePrice?: number | null;
  // CW catalog product id for the recurring Addition. Optional — when unset
  // the recurring line is surfaced in missingProductIds for ops to map.
  cwProductId?: number | null;
  addedBy?: string;
  addedAt?: string;
}

export interface AppliedPromoCode {
  code: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  applyTo: string;
}

export interface QuoteData {
  quoteNumber: string;
  customer: CustomerInfo;
  // null when the admin removed the package — the quote is add-ons and/or
  // custom items only.
  selectedPackage: QuoteSelectedPackage | null;
  selectedAddons: QuoteSelectedAddon[];
  customItems?: QuoteCustomItem[];
  onboarding: QuoteOnboarding;
  appliedPromoCodes: AppliedPromoCode[];
  totals: QuoteTotals;
  terms: {
    version: string;
    id: string;
    url: string;
    content: string;
  };
  agreement?: QuoteAgreement;
  status: QuoteStatus;
  // Alternative Payments
  apCustomerId?: string;
  apInvoiceId?: string;
  apPaymentLink?: string;
  // ConnectWise
  cwCompanyId?: number;
  cwContactId?: number;
  cwOpportunityId?: number;
  cwProjectId?: number;
  cwAgreementId?: number;
  // GoHighLevel
  ghlContactId?: string;
  ghlOpportunityId?: string;
  // Admin-edited free-text notes shown to the customer + copied into the
  // contract PDF. Captures anything the structured fields don't.
  notes?: string;
  // True when this quote is for a company that already exists in ConnectWise.
  // Provisioning adds onto the existing agreement (never removes anything),
  // skips the onboarding project template, and the customer receives the
  // service-addition PDF variant.
  isExistingCustomer?: boolean;
  // Assigned sales rep — used to auto-CC their email when the quote is sent.
  salesRepId?: string;
  salesRep?: { id: string; email: string; name?: string | null };
  timestamp: string;
}

// ── Site Content ─────────────────────────────────────────────────────

export interface SiteContent {
  quoteBuilderHeading: string;
  quoteBuilderSubheading: string;
  quoteBuilderExplainerTitle: string;
  quoteBuilderExplainerBody: string;
}

// ── API Payloads ─────────────────────────────────────────────────────

export interface CreateQuotePayload {
  customer: CustomerInfo;
  // null = no package (admin-only; the public wizard always sends one).
  selectedPackage: QuoteSelectedPackage | null;
  selectedAddons: QuoteSelectedAddon[];
  onboarding: QuoteOnboarding;
  appliedPromoCodes: AppliedPromoCode[];
  totals: QuoteTotals;
  terms: {
    version: string;
    id: string;
    url: string;
    content: string;
  };
  // Admin-only fields (ignored on unauthenticated requests): flag the quote
  // as an existing CW customer and optionally pin the exact CW company /
  // agreement provisioning should target.
  isExistingCustomer?: boolean;
  cwCompanyId?: number | null;
  cwAgreementId?: number | null;
}

export interface CheckoutPayload {
  agreement: QuoteAgreement;
  orderNumber: string;
}

export interface LeadPayload {
  customer: CustomerInfo;
  selectedPackage: QuoteSelectedPackage | null;
  selectedAddons: QuoteSelectedAddon[];
  timestamp: string;
  source: string;
}

// ── Config Response ──────────────────────────────────────────────────

export interface ConfigResponse {
  packages: Package[];
  addons: Addon[];
  promoCodes: PromoCode[];
  terms: TermsContent;
  siteContent: SiteContent;
}

// ── Auth ─────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}
