import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { configApi } from '@/services/api';
import { IS_LEAD_GEN_MODE } from '@/lib/lead-gen';

export interface FeatureGroup {
  category: string;
  items: string[];
}

export interface Package {
  id: string;
  name: string;
  pricePerUser: number;          // Desktop User (Business Premium)
  pricePerUserF3?: number;       // Web User (F3)
  pricePerLocation: number;
  frequency: 'monthly' | 'annually' | 'one-time';
  features: string[];                  // legacy flat list
  featureGroups?: FeatureGroup[];      // preferred categorized list
  isBestValue?: boolean;
  customerVisible?: boolean;
  cwAgreementTypeId?: number | null;
  cwPerUserProductId?: number | null;
  cwPerUserF3ProductId?: number | null;
  cwPerLocationProductId?: number | null;
  agreementMonths?: number; // 0 = MTM, 36 = 3-year, 60 = 5-year
}

export interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
  frequency: 'monthly' | 'annually' | 'one-time';
  active: boolean;
  // Dual pricing fields
  recurringPrice?: number;
  recurringFrequency?: 'monthly' | 'annually';
  setupPrice?: number;
  pricingType: 'recurring-only' | 'one-time-only' | 'both';
  cwProductId?: number | null;
}

// Onboarding fee = 2x monthly recurring. Always waived for portal quotes —
// matches shared/src/constants.ts (duplicated because the client doesn't
// import @ntm/shared).
export const ONBOARDING_FEE_MULTIPLIER = 2;
export const ONBOARDING_WAIVED_FOR_PORTAL = true;
// Lite quoting tool charges the full onboarding fee — no portal waiver. Pass
// { waive: false } from lead-gen contexts to bypass the default waiver.
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
  const waived = options?.waive ?? ONBOARDING_WAIVED_FOR_PORTAL;
  return { base, waived, final: waived ? 0 : base };
}

export interface SelectedAddon extends Addon {
  quantity: number;
  totalRecurringCost?: number;
  totalSetupCost?: number;
}

export interface PromoCode {
  id: string;
  code: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  applyTo: 'one-time' | 'monthly' | 'onboarding';
  active: boolean;
  // Hidden from customer wizard; only applicable from /admin/quotes/:id.
  adminOnly?: boolean;
  // Optional CW catalog product id used to post a negative-priced
  // discount Addition onto the agreement so CW invoices match.
  cwProductId?: number | null;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  address: string;
  /** Desktop User count (Business Premium). */
  userCount: number;
  /** Web User count (F3 / Web & Email Only). */
  webUserCount: number;
  locationCount: number;
  referrerCode?: string;
}

export interface TermsContent {
  id: string;
  version: string;
  content: string;
  lastUpdated: string;
}

export interface SiteContent {
  quoteBuilderHeading: string;
  quoteBuilderSubheading: string;
  quoteBuilderExplainerTitle: string;
  quoteBuilderExplainerBody: string;
}

const defaultSiteContent: SiteContent = {
  quoteBuilderHeading: 'Choose Your Package',
  quoteBuilderSubheading:
    "Pick the plan that fits. We'll size the quote to your team on the next step.",
  quoteBuilderExplainerTitle: 'Desktop User vs Web User',
  quoteBuilderExplainerBody:
    'Desktop User — full Microsoft 365 Business Premium. Use this for your primary staff who need the full desktop apps, Teams calls, and offline access.\n\nWeb User — Microsoft 365 F3 (Web & Email Only). Use this for frontline, warehouse, kiosk, or shared-device employees who only need email and browser-based apps. Costs less per user.',
};

interface QuoteContextType {
  customerInfo: CustomerInfo;
  setCustomerInfo: (info: CustomerInfo) => void;
  selectedPackage: Package | null;
  setSelectedPackage: (pkg: Package | null) => void;
  selectedAddons: SelectedAddon[];
  setSelectedAddons: (addons: SelectedAddon[]) => void;
  packages: Package[];
  setPackages: (packages: Package[]) => void;
  addons: Addon[];
  setAddons: (addons: Addon[]) => void;
  promoCodes: PromoCode[];
  setPromoCodes: (codes: PromoCode[]) => void;
  appliedPromoCodes: PromoCode[];
  setAppliedPromoCodes: (codes: PromoCode[]) => void;
  termsContent: TermsContent;
  setTermsContent: (terms: TermsContent) => void;
  termsHistory: TermsContent[];
  getTermsByVersion: (version: string) => TermsContent | null;
  siteContent: SiteContent;
  refreshConfig: () => Promise<void>;
  saveConfig: (packages: Package[], addons: Addon[], promoCodes?: PromoCode[]) => Promise<void>;
}

const QuoteContext = createContext<QuoteContextType | null>(null);

// Version number - increment this when adding new default data
const CONFIG_VERSION = 9;

// Mirrors shared/src/constants.ts (real NTM pricing from ntm-sales-kb-upload-only).
// Used as offline fallback only — production data comes from /api/config.
const defaultPackages: Package[] = [
  {
    id: 'package-1',
    name: 'Essentials',
    pricePerUser: 59,
    pricePerUserF3: 29,
    pricePerLocation: 300,
    frequency: 'monthly',
    features: [
      '8x5 business hours support (24x7 emergencies)',
      'Remote management & support',
      'Network operations center',
      'Antivirus + MDR + EDR',
      'DNS filtering',
      'Automated patching & software deployment',
    ],
    featureGroups: [
      { category: 'Support', items: [
        '8×5 Support (Emergency Support Extra)',
        'Helpdesk Button Support & Forms',
        'Remote Management and Support',
        'Network Operations Center (NOC)',
      ]},
      { category: 'Security', items: [
        'Device Antivirus Protection',
        'Managed Detection and Response (MDR)',
        'Endpoint Detection and Response (EDR)',
        'Security Operations Center (SOC)',
        'DNS Filtering',
        'Darkweb Monitoring',
      ]},
      { category: 'Management', items: [
        'Automated Patching and Microsoft Update Deployment',
        'Support for Firewall, Switch and UPS',
        'Automated Software Deployment',
        'Professional Services Automation (PSA)',
        'Documentation and Password Repository',
      ]},
    ],
    isBestValue: false,
    customerVisible: false, // hidden from public pricing
    agreementMonths: 0,
    cwAgreementTypeId: 36,
    cwPerUserProductId: 1096,
    cwPerUserF3ProductId: 1118,
    cwPerLocationProductId: 1099,
  },
  {
    id: 'package-2',
    name: 'SafeSecure',
    pricePerUser: 119,
    pricePerUserF3: 29,
    pricePerLocation: 400,
    frequency: 'monthly',
    features: [
      'Everything in Essentials',
      'Vendor liaison',
      'Darkweb monitoring',
      'Mobile device management (MDM)',
      'Email encryption',
      'Microsoft 365 backups',
    ],
    featureGroups: [
      { category: 'Support', items: [
        '8×5 Support (Emergency Support Extra)',
        'Helpdesk Button Support & Forms',
        'Remote Management and Support',
        'Network Operations Center (NOC)',
        'Microsoft Office 365 Business Premium Licenses and Support Management',
        'Vendor Liaison',
      ]},
      { category: 'Security', items: [
        'Device Antivirus Protection',
        'Managed Detection and Response (MDR)',
        'Endpoint Detection and Response (EDR)',
        'Security Operations Center (SOC)',
        'DNS Filtering',
        'Darkweb Monitoring',
        'Privileged Access Manager (PAM) Self Authorization',
        'Mobile Device Management (MDM)',
        'Email MFA',
        'Email Encryption',
        'Single Sign-on (SSO)',
      ]},
      { category: 'Management', items: [
        'Automated Patching and Microsoft Update Deployment',
        'Support for Firewall, Switch and UPS',
        'Automated Software Deployment',
        'Professional Services Automation (PSA)',
        'Documentation and Password Repository',
        'Licensed User M365 Backups',
        'Conditional Access',
        'Self Service Password Resets',
        'Cloud Print Solution',
        'Tenant Branding',
      ]},
    ],
    isBestValue: true,
    customerVisible: true,
    agreementMonths: 36,
    cwAgreementTypeId: 37,
    cwPerUserProductId: 1097,
    cwPerUserF3ProductId: 1119,
    cwPerLocationProductId: 1245,
  },
  {
    id: 'package-3',
    name: 'SafeSecure Plus',
    pricePerUser: 179,
    pricePerUserF3: 59,
    pricePerLocation: 500,
    frequency: 'monthly',
    features: [
      'Everything in SafeSecure',
      '24x7 support included',
      'On-site support included',
      'Advanced threat protection',
    ],
    featureGroups: [
      { category: 'Support', items: [
        '24×7 Support (Emergencies Included)',
        'Helpdesk Button Support & Forms',
        'Remote Management and Support',
        'Network Operations Center (NOC)',
        'Microsoft Office 365 Business Premium Licenses and Support Management',
        'Vendor Liaison',
        'Monthly Account Summary Reporting',
      ]},
      { category: 'Security', items: [
        'Device Antivirus Protection',
        'Managed Detection and Response (MDR)',
        'Endpoint Detection and Response (EDR)',
        'Security Operations Center (SOC)',
        'DNS Filtering',
        'Darkweb Monitoring',
        'Privileged Access Manager (PAM) Self Authorization',
        'Mobile Device Management (MDM)',
        'Email MFA',
        'Email Encryption',
        'Single Sign-on (SSO)',
        'Advanced Threat Protection (ATP)',
        'Security Vulnerability Reporting',
        'Security Awareness Training (SAT)',
        'Duo Multi-Factor Authentication',
        'Security Information and Event Management (SIEM)',
      ]},
      { category: 'Management', items: [
        'Automated Patching and Microsoft Update Deployment',
        'Support for Firewall, Switch and UPS',
        'Automated Software Deployment',
        'Professional Services Automation (PSA)',
        'Documentation and Password Repository',
        'Licensed User M365 Backups',
        'Conditional Access',
        'Self Service Password Resets',
        'Cloud Print Solution',
        'Tenant Branding',
        'Cyber Insurance Application and Audit Reviews',
      ]},
    ],
    isBestValue: false,
    customerVisible: true,
    agreementMonths: 36,
    cwAgreementTypeId: 38,
    cwPerUserProductId: 1098,
    cwPerUserF3ProductId: 1120,
    cwPerLocationProductId: 1246,
  },
];

// Real NTM addons (per ntm-sales-kb-upload-only/add-on-pricing.csv).
const defaultAddons: Addon[] = [
  {
    id: 'addon-voice-voip',
    name: 'Voice Phone (VoIP)',
    description: 'Cloud VoIP phone line. Billed per phone line per month.',
    price: 20, frequency: 'monthly',
    recurringPrice: 20, recurringFrequency: 'monthly', setupPrice: 0,
    pricingType: 'recurring-only', active: true,
    cwProductId: 310, // WHITELABEL0001-MRR — quoted at $20 vs $30 catalog rate
  },
  {
    id: 'addon-teams-phone',
    name: 'Microsoft Teams Phone',
    description: 'Microsoft Teams Phone licensing. Billed per user per month.',
    price: 15, frequency: 'monthly',
    recurringPrice: 15, recurringFrequency: 'monthly', setupPrice: 0,
    pricingType: 'recurring-only', active: true,
    cwProductId: 1274, // MICROSOFT0057-MRR
  },
  {
    id: 'addon-efax',
    name: 'eFaxing',
    description: 'Cloud fax service. Billed per fax line per month.',
    price: 25, frequency: 'monthly',
    recurringPrice: 25, recurringFrequency: 'monthly', setupPrice: 0,
    pricingType: 'recurring-only', active: true,
    cwProductId: 792, // WHITELABEL0004-MRR
  },
  {
    id: 'addon-m365-backups',
    name: 'Microsoft SaaS Backups',
    description: 'Infinite SaaS protection backups for Microsoft 365 (mail, OneDrive, SharePoint). Billed per mailbox per month.',
    price: 6, frequency: 'monthly',
    recurringPrice: 6, recurringFrequency: 'monthly', setupPrice: 0,
    pricingType: 'recurring-only', active: true,
    cwProductId: 189, // DATTO0003-MRR
  },
  {
    id: 'addon-server-mgmt',
    name: 'Server Management per VM',
    description: 'Managed server services. Billed per managed virtual machine per month.',
    price: 175, frequency: 'monthly',
    recurringPrice: 175, recurringFrequency: 'monthly', setupPrice: 0,
    pricingType: 'recurring-only', active: true,
    cwProductId: 204, // MANAGEDIT0004
  },
];

const defaultPromoCodes: PromoCode[] = [
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

const generateTermsId = (version: string) => {
  return `terms-v${version}-${Date.now()}`;
};

// Offline fallback only — production data comes from /api/terms which is
// seeded from shared/src/constants.ts defaultTermsContent. Kept as a stub
// so the UI doesn't render an empty card before /api/config returns; full
// MSA text lives server-side.
const defaultTermsContent: TermsContent = {
  id: generateTermsId('2.0'),
  version: '2.0',
  content: `# Terms and Conditions
> Loading the latest Terms and Conditions…`,
  lastUpdated: new Date().toISOString(),
};

export const QuoteProvider = ({ children }: { children: ReactNode }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    address: '',
    userCount: 1,
    webUserCount: 0,
    locationCount: 1,
    referrerCode: '',
  });
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddon[]>([]);
  // Lite quoting tool hides Essentials so the lead-gen visitor never sees it
  // even on the brief offline-fallback render before /api/config returns.
  // Offline fallback — production data comes from /api/config which already
  // applies the customerVisible filter server-side.
  const [packages, setPackages] = useState<Package[]>(
    defaultPackages.filter((p) => p.customerVisible !== false),
  );
  const [addons, setAddons] = useState<Addon[]>(defaultAddons);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>(defaultPromoCodes);
  const [appliedPromoCodes, setAppliedPromoCodes] = useState<PromoCode[]>([]);
  const [termsContent, setTermsContent] = useState<TermsContent>(defaultTermsContent);
  const [termsHistory, setTermsHistory] = useState<TermsContent[]>([]);
  const [siteContent, setSiteContent] = useState<SiteContent>(defaultSiteContent);

  const refreshConfig = async () => {
    try {
      // Fetch from API (primary source)
      const data = await configApi.get();
      setPackages(data.packages || defaultPackages);
      setAddons(data.addons || defaultAddons);
      setPromoCodes(data.promoCodes || defaultPromoCodes);
      if (data.terms) {
        setTermsContent(data.terms);
      }
      if (data.siteContent) {
        setSiteContent(data.siteContent);
      }
    } catch (error) {
      // Fall back to defaults if API is unreachable
      console.warn('API unavailable, using defaults:', error);
      setPackages(defaultPackages);
      setAddons(defaultAddons);
      setPromoCodes(defaultPromoCodes);
    }
  };

  const saveConfig = async (newPackages: Package[], newAddons: Addon[], newPromoCodes?: PromoCode[]) => {
    // Update local state immediately
    setPackages(newPackages);
    setAddons(newAddons);
    if (newPromoCodes) {
      setPromoCodes(newPromoCodes);
    }
    // Admin CRUD is handled by individual admin API calls,
    // so saveConfig just updates local state.
  };

  const saveTermsContent = (terms: TermsContent) => {
    const termsWithId = terms.id ? terms : { ...terms, id: generateTermsId(terms.version) };
    setTermsHistory(prevHistory => {
      const newHistory = [termsContent, ...prevHistory];
      return newHistory.slice(0, 50);
    });
    setTermsContent(termsWithId);
  };

  const getTermsByVersion = (version: string): TermsContent | null => {
    // Check current version first
    if (termsContent.version === version) {
      return termsContent;
    }
    
    // Check history
    return termsHistory.find(t => t.version === version) || null;
  };

  useEffect(() => {
    refreshConfig()
      .catch(err => {
        console.error('Failed to load config:', err);
      })
      .finally(() => {
        setIsInitialized(true);
      });
  }, []);

  return (
    <QuoteContext.Provider
      value={{
        customerInfo,
        setCustomerInfo,
        selectedPackage,
        setSelectedPackage,
        selectedAddons,
        setSelectedAddons,
        packages,
        setPackages,
        addons,
        setAddons,
        promoCodes,
        setPromoCodes,
        appliedPromoCodes,
        setAppliedPromoCodes,
        termsContent,
        setTermsContent: saveTermsContent,
        termsHistory,
        getTermsByVersion,
        siteContent,
        refreshConfig,
        saveConfig,
      }}
    >
      {isInitialized ? children : null}
    </QuoteContext.Provider>
  );
};

export const useQuote = () => {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error('useQuote must be used within QuoteProvider');
  }
  return context;
};
