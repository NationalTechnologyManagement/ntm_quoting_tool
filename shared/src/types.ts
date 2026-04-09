// ── Package & Addon Types ────────────────────────────────────────────

export interface Package {
  id: string;
  name: string;
  pricePerUser: number;
  pricePerLocation: number;
  frequency: 'monthly' | 'annually' | 'one-time';
  features: string[];
  isBestValue?: boolean;
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
