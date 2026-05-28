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
    // Legacy flat list — kept for snapshotted-quote backwards compat.
    features: [
      '8x5 business hours support (24x7 emergencies)',
      'Remote management & support',
      'Network operations center',
      'Antivirus + MDR + EDR',
      'DNS filtering',
      'Automated patching & software deployment',
    ],
    // Canonical structured list rendered on the package card + contract PDF.
    featureGroups: [
      {
        category: 'Support',
        items: [
          '8×5 Support (Emergency Support Extra)',
          'Helpdesk Button Support & Forms',
          'Remote Management and Support',
          'Network Operations Center (NOC)',
        ],
      },
      {
        category: 'Security',
        items: [
          'Device Antivirus Protection',
          'Managed Detection and Response (MDR)',
          'Endpoint Detection and Response (EDR)',
          'Security Operations Center (SOC)',
          'DNS Filtering',
          'Darkweb Monitoring',
        ],
      },
      {
        category: 'Management',
        items: [
          'Automated Patching and Microsoft Update Deployment',
          'Support for Firewall, Switch and UPS',
          'Automated Software Deployment',
          'Professional Services Automation (PSA)',
          'Documentation and Password Repository',
        ],
      },
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
    featureGroups: [
      {
        category: 'Support',
        items: [
          '8×5 Support (Emergency Support Extra)',
          'Helpdesk Button Support & Forms',
          'Remote Management and Support',
          'Network Operations Center (NOC)',
          'Microsoft Office 365 Business Premium Licenses and Support Management',
          'Vendor Liaison',
        ],
      },
      {
        category: 'Security',
        items: [
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
        ],
      },
      {
        category: 'Management',
        items: [
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
        ],
      },
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
    featureGroups: [
      {
        category: 'Support',
        items: [
          '24×7 Support (Emergencies Included)',
          'Helpdesk Button Support & Forms',
          'Remote Management and Support',
          'Network Operations Center (NOC)',
          'Microsoft Office 365 Business Premium Licenses and Support Management',
          'Vendor Liaison',
          'Monthly Account Summary Reporting',
        ],
      },
      {
        category: 'Security',
        items: [
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
        ],
      },
      {
        category: 'Management',
        items: [
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
        ],
      },
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

// Master Services Agreement — sourced from NTM_Terms_and_Conditions.pdf.
// Format: section headings (`## N. TITLE`), subsection labels (`### Name`),
// bullets (`- text`), paragraphs, and table rows (`| col | col | ... |`,
// first row of a contiguous block is the header). Parsed by the renderers
// in client/src/pages/Terms.tsx and server/src/templates/contract.ts.
export const defaultTermsContent: Omit<TermsContent, 'id' | 'lastUpdated'> = {
  version: '2.0',
  content: `# Terms and Conditions
> SR Partners, LLC d/b/a National Technology Management  |  Effective upon execution of each Service Order  |  Michigan Governing Law

## 1. SERVICE AGREEMENT
This Agreement is entered into between SR Partners, LLC d/b/a National Technology Management ("NTM"), a Michigan limited liability company, and the Client identified in the applicable Service Order ("Client"). NTM is in the business of providing managed information technology services and other associated services. This Agreement establishes the terms under which NTM provides those services.

### Term & Auto-Renewal
- The initial term of each Service Order is 36 months from the date of execution.
- Upon expiration of the initial term, each Service Order automatically renews for consecutive one-year terms unless either party provides written notice of non-renewal at least 90 days prior to the start of the renewal term.
- During each renewal year, pricing adjusts per Section 2 (Rate Increases). Month-to-month agreements are available at NTM's discretion and noted in the Service Order.

### Change Orders
- Any change to the scope of services requires a written Change Order signed by both NTM and Client to be effective.
- Unless otherwise stated, changes are effective as of the date of the change (prorated for any partial month) or the beginning of the next calendar month, at NTM's option.
- Fee changes resulting from changes in user count or licenses take effect at the beginning of the next calendar month.

### NTM Obligations
- NTM shall appoint a primary contact (NTM Contract Manager) with authority to act on matters under this Agreement, and staff services with suitably skilled and qualified personnel.
- NTM shall conduct background checks on all personnel performing services, comprising at minimum a review of credit history, references, and criminal record.
- NTM shall obtain Client's written approval before engaging any subcontractors. NTM remains fully responsible for all subcontractor performance as if they were NTM's own employees.

### Client Obligations
- Client shall appoint a primary contact (Client Contract Manager) with authority to act on matters under this Agreement.
- Client shall provide NTM with reasonable access to premises, systems, and information required to perform services.
- Client shall ensure all Client equipment is in good working order and conforms to applicable legal and industry standards prior to the start of services.
- If NTM's performance is prevented or delayed by any act or omission of Client, NTM shall not be deemed in breach nor liable for any resulting costs or losses.

## 2. PRICING AND PAYMENT

### Fees
- All pricing is per user and/or per location as specified in the applicable Service Order.
- Recurring fees are billed in advance on a monthly, quarterly, or annual basis as stated in the Service Order. Non-recurring and project-based fees are billed monthly in arrears unless otherwise stated.
- All prices are in USD and exclude applicable taxes, which are the sole responsibility of Client. Client is not responsible for taxes on NTM's income, personnel, or property.

### Payment Terms
- Invoices are due within 30 days of receipt.
- If payment is not received within 15 days after becoming due, NTM may: (a) charge interest at 1.5% per month (or the maximum permitted by law, if lower) from the due date until paid; and (b) suspend all services until full payment is received, excluding amounts disputed in good faith.
- Client shall reimburse NTM for all reasonable costs of collecting overdue amounts, including attorney's fees and collection agency fees.

### Invoice Disputes
- To dispute an invoice, Client must deliver written notice to NTM no later than 15 days before the invoice due date, identifying all disputed items with reasonable detail.
- Undisputed amounts remain due and payable regardless of any pending dispute. NTM shall continue performing services during a good-faith invoice dispute.

### Rate Increases
- Time & Materials rates may be increased once per contract year, with at least 90 days' written notice, by no more than the lesser of (a) the prior 12-month CPI (All Urban Consumers, All Items, Bureau of Labor Statistics) or (b) 5%.
- Fixed-price renewals: fees increase by 7% for each one-year renewal term.
- Third-party vendor pass-through increases may be passed to Client at cost with 90 days' advance notice, or less if the vendor's effective date is sooner.

### Expenses & Payment Methods
- Client shall reimburse NTM for all actual, documented, and reasonable travel and out-of-pocket expenses approved in advance in writing by Client.
- Accepted payment methods: check, credit card, ACH, or wire transfer. All payments in USD.
- Clients enrolled in automated electronic payment (ACH/credit card) may receive a per-user discount as noted in the Service Order.

## 3. ONBOARDING
- Standard onboarding, planning, configuration, and installation services are included with all packages as specified in the Service Order.
- When onboarding fees apply, they equal two (2) months of the monthly recurring charge and are due in full on the date the Service Order is signed.
- Monthly recurring charges are due on the first day of each month for which the service takes place.
- NTM will communicate the onboarding timeline and required Client cooperation upon execution of the Service Order.
- Client is responsible for ensuring all Client-owned equipment is in good working order prior to the start of onboarding.

## 4. CANCELLATION AND TERMINATION

### Early Termination by Client
- Client may terminate this Agreement or any Service Order for any reason upon 90 days' prior written notice to NTM.
- Early termination triggers an Early Termination Fee ("ETF") equal to the monthly recurring fee multiplied by the number of months remaining in the current term, in addition to any outstanding fees owed at termination.
- The ETF represents a negotiated estimate of NTM's anticipated losses and is not a penalty. Payment of the ETF is Client's sole liability and NTM's exclusive remedy for Client-initiated early termination.

### Termination for Cause
- Either party may terminate immediately upon written notice if the other party materially breaches this Agreement and, where the breach is curable, fails to cure within 30 days of written notice.
- NTM may terminate immediately (without a cure period) if, following suspension of services for non-payment, any undisputed overdue balance remains unpaid for an additional 10 days after notice.
- Either party may terminate immediately if the other: (a) becomes insolvent; (b) makes a general assignment for the benefit of creditors; (c) is subject to bankruptcy proceedings not stayed within 7 business days or dismissed within 45 days; or (d) is dissolved or liquidated.
- Upon NTM termination for cause, all fees through the conclusion of all Service Orders become immediately due.

### Effect of Termination
- Upon termination, NTM shall promptly return all Client data, equipment, and materials in its possession and provide reasonable transition assistance at Client's written request and expense.
- Each party shall return or permanently delete the other party's Confidential Information and certify compliance in writing within 30 days of termination.
- All outstanding fees, including any applicable ETF, will be invoiced within 10 days of termination. No refunds are provided for prepaid, unused service periods.

## 5. SERVICE LEVEL

### Support Hours
- Standard support is available Monday through Friday, 8:00 AM to 5:00 PM Eastern Time ("Business Hours"), excluding NTM-observed holidays.
- After-hours emergency support is available 24/7 for Priority 1 – Critical issues. Emergency rates apply for after-hours requests on plans without included 24/7 coverage.
- SafeSecure Plus clients receive 24/7 emergency assistance at no additional charge.

### Uptime Commitment
- NTM targets 99.9% uptime for NTM-managed services under its direct control. This excludes scheduled maintenance windows, third-party outages, and Force Majeure Events.

### Incident Priority & Response Times
| Priority | Description | Response Time | Resolution Target | Coverage |
| P1 – Critical | Complete outage / security breach / business-stopping event | 15 minutes | 2 hours | 24/7 |
| P2 – High | Major functionality impaired / significant user impact | 1 hour | 4 hours | 8/5 * |
| P3 – Medium | Partial degradation / workaround available | 4 hours | Next business day | 8/5 |
| P4 – Low | Minor issue / single user / no business impact | 8 hours | Within 3 business days | 8/5 |
| P5 – Request | Service request / new feature / scheduled work | Next business day | Per project scope | 8/5 |
> * P2 24/7 coverage available on SafeSecure Plus plans.

### Priority Definitions
- **P1 – Critical:** Complete system/network outage, ransomware or active security incident, inability of all users to work.
- **P2 – High:** Major application failure, significant user impact, no viable workaround.
- **P3 – Medium:** Partial degradation of service, workaround available, limited user impact.
- **P4 – Low:** Minor issue affecting a single user, no business impact.
- **P5 – Request:** New service request, scheduled changes, onboarding tasks, project work.

### SLA Exclusions
- Response times are measured during covered hours only and do not apply to issues caused by Client hardware, Client actions, third-party vendors outside NTM's control, or Force Majeure Events.

## 6. DATA SECURITY

### Data Ownership & Use
- Client retains full ownership of all data uploaded to or processed by NTM systems.
- NTM will use and disclose Client data only as necessary to perform services and will not sell or share Client data with third parties without prior written consent, except as required by law.
- NTM will notify Client before any legally compelled disclosure of Client data where permitted by law.

### Information Security
- NTM maintains an Information Security Policy and employs reasonable security measures to protect Client data, including industry-standard encryption for Sensitive Personal Information.
- Where applicable, NTM complies with Payment Card Industry Data Security Standard (PCI DSS) requirements.
- NTM conducts an independent security controls review or audit at least annually based on recognized industry standards.

### Data Breach Notification
- NTM maintains a Cyber Incident Response Plan and will implement its procedures upon discovery of any data breach or security incident.
- NTM will notify Client as soon as reasonably practicable upon becoming aware of any breach or security incident involving Client data.
- NTM will not notify third parties of a breach without Client's prior written consent, except as required by law.

### Confidentiality
- Both parties agree to hold each other's Confidential Information in strict confidence and not disclose it to any third party or use it for any purpose outside this Agreement.
- Confidential Information obligations survive termination. Neither party shall reverse engineer any software or hardware constituting the other party's Confidential Information.

### Data Return & Disposal
- Upon termination or at Client's written request, NTM will promptly return or securely destroy all Client Personal Information and certify such return or destruction in writing.
- Client is responsible for notifying NTM in writing if any information provided contains Personal Information.

## 7. LIMITATION OF LIABILITY
- Except for indemnification obligations and damages covered by a party's insurance, neither party's aggregate liability arising from or related to this Agreement—whether in contract, tort, or otherwise—will exceed the total fees paid or payable to NTM in the 12 months preceding the event giving rise to the claim.
- Neither party will be liable for breach-of-contract damages that were not reasonably foreseeable at the time of the breach. Each party waives any right to bring a claim for damages arising from special circumstances not known to the other party at the time of this Agreement.
- NTM is not liable for service interruptions caused by circumstances beyond its reasonable control, including third-party outages, Client-caused issues, or Force Majeure Events.
- Except for the warranties expressly stated in this Agreement, NTM makes no implied warranties of merchantability, fitness for a particular purpose, title, or non-infringement.
- Nothing in this section limits either party's liability for fraud, willful misconduct, or gross negligence.

## 8. MODIFICATIONS TO THIS AGREEMENT
- Any amendment to this Agreement must be made in writing and signed by authorized representatives of both NTM and Client to be effective. No waiver of any provision is effective unless in writing and signed by the waiving party. A waiver on one occasion does not operate as a waiver on future occasions.
- NTM will communicate material service or policy changes via email to the Client's designated contact with at least 30 days' advance notice.
- Continued use of services following a notified change constitutes acceptance, provided the change does not alter signed pricing, term length, or core service obligations without a written amendment.

## 9. INTELLECTUAL PROPERTY
- NTM retains ownership of all pre-existing materials, methodologies, tools, and intellectual property used in delivering services ("Pre-Existing Materials").
- NTM grants Client a non-exclusive, worldwide, perpetual license to use Deliverables paid for under this Agreement solely for Client's internal business purposes.
- Client retains ownership of all Client Materials. NTM has no right to use Client Materials except as necessary to perform services under this Agreement.
- To NTM's knowledge, the services and deliverables do not infringe any registered U.S. patent, copyright, or trademark of any third party.

## 10. NON-SOLICITATION
- During the term of this Agreement and for one (1) year following its termination, Client shall not directly or indirectly solicit, recruit, or hire any NTM employee or independent contractor who performed services under this Agreement.
- This restriction does not apply to individuals who respond to general public job postings not specifically targeting NTM personnel.
- Breach of this section entitles NTM to liquidated damages equal to one year's compensation of the solicited individual plus NTM's actual replacement recruitment costs. The parties acknowledge this represents a reasonable estimate of anticipated harm, not a penalty.

## 11. INDEMNIFICATION

### NTM Indemnification
- NTM will defend and indemnify Client against third-party claims that Client's use of NTM services infringes any U.S. intellectual property right, except where such claims arise from: (a) Client Materials; (b) unauthorized modifications by Client; or (c) use of deliverables combined with materials not supplied by NTM.

### Client Indemnification
- Client will defend and indemnify NTM against third-party claims arising from: (a) Client's negligent or willful acts or omissions; (b) Client's agreements with third parties; or (c) bodily injury or property damage caused by Client.

### Indemnification Procedure
- The indemnified party must notify the indemnifying party in writing within 10 days of learning of any claim. Failure to timely notify may reduce indemnification obligations to the extent the indemnifying party is prejudiced.
- The indemnifying party has the right to assume control of the defense with counsel reasonably acceptable to the indemnified party. Settlement requires that it not admit liability on the indemnified party's behalf.

## 12. FORCE MAJEURE
- "Force Majeure Event" means any event or circumstance not caused by the affected party that prevents performance, excluding strikes affecting only that party, general economic changes, changes in law, or inability to pay.
- Neither party will be in breach for delays or failures caused by a Force Majeure Event, provided the affected party: (a) uses reasonable efforts to perform; (b) had reasonable contingency measures in place; and (c) promptly notifies the other party of the event, its expected duration, and ongoing updates.
- Both parties shall use reasonable efforts to mitigate damages and resume performance as quickly as practicable.

## 13. ELECTRONIC SIGNATURE
- By providing an electronic signature and agreeing to these terms, the signing party acknowledges that the electronic signature is legally binding and equivalent to a handwritten signature under applicable law.
- The individual signing represents and warrants that they are duly authorized to bind Client to this Agreement and that execution does not violate any existing material agreement to which Client is a party.

## 14. CONTACT INFORMATION
For questions about these terms or your service agreement, please contact:
- **Company:** National Technology Management (SR Partners, LLC d/b/a)
- **Address:** 30400 Telegraph Rd., Ste. 116, Bingham Farms, MI 48025
- **Phone:** (248) 658-0830
- **Email:** sales@trustntm.com
- **Website:** www.trustntm.com/terms

## 15. GOVERNING LAW AND DISPUTE RESOLUTION
- Michigan law governs all adversarial proceedings arising out of this Agreement or the services, without regard to conflict of law principles.

### Arbitration
- Except for (a) NTM's proceedings to recover unpaid fees or expenses or (b) either party's request for injunctive or equitable relief, all disputes will be resolved exclusively by binding arbitration administered by JAMS.
- Claims under $250,000: JAMS Streamlined Arbitration Rules. Claims over $250,000: JAMS Comprehensive Arbitration Rules and Procedures, including the Optional Appeal Procedure.
- Arbitration will be conducted by a single arbitrator with managed IT services expertise, conducted virtually (Zoom or similar) or, if unavailable, in Oakland County, Michigan.
- The arbitrator may not award punitive damages in excess of compensatory damages. Each party waives the right to recover any excess punitive damages. Judgment on any arbitration award may be entered in any court of competent jurisdiction.

### Court Proceedings
- For injunctive relief, recovery of unpaid fees, or enforcement of arbitration awards, the parties consent to exclusive jurisdiction in the United States District Court for the Eastern District of Michigan or a Michigan state court in Oakland County. Each party waives any objection to venue or inconvenient forum.

### Attorney's Fees & Severability
- The prevailing party in any adversarial proceeding is entitled to recover reasonable legal fees, court costs, and expenses from the non-prevailing party.
- If any provision of this Agreement is held unenforceable, it will be modified to the minimum extent necessary to make it enforceable, or disregarded if modification is not permitted by law. All remaining provisions continue in full force.
- This Agreement, together with the applicable Service Order(s), constitutes the entire understanding between the parties and supersedes all prior agreements, written or oral.`,
};

export const SERVICE_PROVIDER = {
  company: 'SR Partners LLC dba National Technology Management',
  contact: 'Kelly Siegel',
  email: 'sales@trustntm.com',
  phone: '(248) 658-0830',
  address: '30400 Telegraph Rd Ste 116, Bingham Farms MI 48025',
} as const;
