// ── Package & Addon Types ────────────────────────────────────────────

export interface Package {
  id: string;
  name: string;
  pricePerUser: number;
  pricePerLocation: number;
  frequency: 'monthly' | 'annually' | 'one-time';
  features: string[];
  isBestValue?: boolean;
  // CW agreement type id this package maps to. Required for `createAgreement`
  // to work; nullable so the schema doesn't break legacy rows during migration.
  cwAgreementTypeId?: number | null;
  // CW catalog product IDs for the package's recurring lines. postAdditions
  // posts one Agreement Addition per filled-in product: per-user × userCount,
  // per-user F3 × F3 count (if/when surfaced), per-location × locationCount.
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
  userCount: number;
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
}

export interface QuoteSelectedPackage {
  id: string;
  name: string;
  pricePerUser: number;
  pricePerLocation: number;
  frequency: string;
  features: string[];
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

export interface AppliedPromoCode {
  code: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  applyTo: string;
}

export interface QuoteData {
  quoteNumber: string;
  customer: CustomerInfo;
  selectedPackage: QuoteSelectedPackage;
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
  timestamp: string;
}

// ── API Payloads ─────────────────────────────────────────────────────

export interface CreateQuotePayload {
  customer: CustomerInfo;
  selectedPackage: QuoteSelectedPackage;
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
