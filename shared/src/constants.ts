import type { Package, Addon, PromoCode, TermsContent } from './types.js';

export const ONBOARDING_COST_PER_USER = 200;
export const QUOTE_VALIDITY_DAYS = 30;

export const defaultPackages: Package[] = [
  {
    id: 'package-1',
    name: 'Starter Package',
    pricePerUser: 29,
    pricePerLocation: 50,
    frequency: 'monthly',
    features: ['Up to 10 users', '5GB storage', 'Email support', 'Basic analytics'],
    isBestValue: false,
  },
  {
    id: 'package-2',
    name: 'Professional Package',
    pricePerUser: 49,
    pricePerLocation: 99,
    frequency: 'monthly',
    features: [
      'Unlimited users',
      '50GB storage',
      'Priority phone support',
      'Advanced analytics',
      'API access',
      'Custom integrations',
    ],
    isBestValue: true,
  },
  {
    id: 'package-3',
    name: 'Enterprise Package',
    pricePerUser: 79,
    pricePerLocation: 149,
    frequency: 'monthly',
    features: [
      'Unlimited users',
      '500GB storage',
      '24/7 dedicated support',
      'Advanced analytics & reporting',
      'Full API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'White-label options',
    ],
    isBestValue: false,
  },
];

export const defaultAddons: Addon[] = [
  {
    id: 'addon-1',
    name: 'Premium Support',
    description: '24/7 phone and email support with 1-hour response time',
    price: 99,
    frequency: 'monthly',
    recurringPrice: 99,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
  },
  {
    id: 'addon-2',
    name: 'Advanced Analytics',
    description: 'Custom reporting dashboard with real-time insights',
    price: 149,
    frequency: 'monthly',
    recurringPrice: 149,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
  },
  {
    id: 'addon-3',
    name: 'Onboarding Training',
    description: '4 hours of personalized training for your team',
    price: 499,
    frequency: 'one-time',
    setupPrice: 499,
    pricingType: 'one-time-only',
    active: true,
  },
  {
    id: 'addon-4',
    name: 'API Access',
    description: 'Full REST API with documentation and support',
    price: 199,
    frequency: 'monthly',
    recurringPrice: 199,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
  },
  {
    id: 'addon-5',
    name: 'Phone System',
    description: 'Cloud-based phone system with call routing',
    price: 30,
    frequency: 'monthly',
    recurringPrice: 30,
    recurringFrequency: 'monthly',
    setupPrice: 500,
    pricingType: 'both',
    active: true,
  },
  {
    id: 'addon-6',
    name: 'Access Control',
    description: 'Digital access control and door management',
    price: 20,
    frequency: 'monthly',
    recurringPrice: 20,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
  },
  {
    id: 'addon-7',
    name: 'CCTV Integration',
    description: 'Security camera system integration',
    price: 20,
    frequency: 'monthly',
    recurringPrice: 20,
    recurringFrequency: 'monthly',
    setupPrice: 350,
    pricingType: 'both',
    active: true,
  },
  {
    id: 'addon-8',
    name: 'Data Backup',
    description: 'Automated daily backups with 30-day retention',
    price: 79,
    frequency: 'monthly',
    recurringPrice: 79,
    recurringFrequency: 'monthly',
    setupPrice: 0,
    pricingType: 'recurring-only',
    active: true,
  },
  {
    id: 'addon-9',
    name: 'Custom Branding',
    description: 'White-label customization of your portal',
    price: 199,
    frequency: 'one-time',
    setupPrice: 199,
    pricingType: 'one-time-only',
    active: true,
  },
  {
    id: 'addon-10',
    name: 'Migration Service',
    description: 'Full data migration from your existing system',
    price: 999,
    frequency: 'one-time',
    setupPrice: 999,
    pricingType: 'one-time-only',
    active: true,
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
