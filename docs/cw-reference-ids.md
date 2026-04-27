# ConnectWise Reference IDs — Audit Results (NTM Production)

Source of truth for the integration's reference data. Audited against `https://api-na.myconnectwise.net/v4_6_release/apis/3.0` on 2026-04-27 (CW Manage `v2025.1.10573`).

API base: `https://api-na.myconnectwise.net/v4_6_release/apis/3.0`
Company ID: `ntm`
Auth: Basic `<companyId>+<publicKey>:<privateKey>` + header `clientId: <CW_CLIENT_ID>`
OpenAPI source: `C:\Users\GeneAldaco\Downloads\All.json` (CW 2026.4)

> **Status legend**
> ✅ value confirmed and seeded
> ⚠️ blocked by API key permissions — needs CW admin to grant the role
> 🚧 prerequisite cleanup in CW required before integration will work end-to-end
> 🤝 per-row config (set in admin UI per Package/Addon, not in `CwConfig`)

---

## 🚧 Prerequisite cleanup in CW (do these BEFORE going live)

These are all things the spec called out as "if not standardized in your CW today, that's prerequisite cleanup work." The audit confirmed they aren't.

1. ~~**Decide agreement-type mapping for new packages.**~~ ✅ **Resolved 2026-04-27** — keeping legacy types: **Essentials → 36**, **SafeSecure → 37**, **SafeSecure Plus → 38**. Wired into `defaultPackages` and the seed; admin UI exposes a per-package "CW Agreement Type ID" input for overrides.
2. **Create custom fields for cross-reference**, on these entities:
   - Company: `Quote ID` (text)
   - Agreement: `Quote ID` (text)
   - Project: `Agreement Number` (text)
   None of these exist today. Until they do, the `crossref` step will skip silently. Not blocking, but loses the audit trail back to the quote.
3. **Map `cwProductId` per Addon**, in the admin UI's Addon page — once we can read the catalog. Currently blocked (see ⚠️ below).
4. ~~**Grant API key these missing roles**~~ ✅ **Resolved 2026-04-27** — new key issued with read access to `system/members`, `system/locations`, `system/departments`, `procurement/catalog`, and `finance/agreements`. All five endpoints verified working.

---

## 1. Agreement Types

**Endpoint:** `GET /finance/agreements/types`

| Quoting-tool package | CW agreement type | CW ID |
|---|---|---|
| ✅ Essentials | 00791 Essentials Package | **36** |
| ✅ SafeSecure | 00792 SafeSecure Package | **37** |
| ✅ SafeSecure Plus | 00793 SafeSecure Plus Package | **38** |

These are wired into `defaultPackages` and the seed backfills `cwAgreementTypeId` on existing rows by name match. The PackageManagement admin page exposes a per-row override field.

**Other CW agreement types (for reference, not currently used by the integration):**
14 Managed Services · 29 T&M · 30 Physical Security · 31 Subscription Services · 32 Managed Services Agreement · 34 Carrier Services · 35 LOB Support · 39 Cloud Voice · 40 HaaS · 41 Access Control & Video · 42 Managed Server · 43 Managed IT.

---

## 2. Catalog Products (per addon)

✅ Catalog readable (1,547 items total). Per-row `cwProductId` mapping is required by CW Manage 2026.4 (`Addition.product` is required on POST). Identifier convention observed: `<vendor>####-MRR` for monthly recurring items.

🤝 **Admin UI:** the AddonManagement page now exposes a per-row "CW Catalog Product ID" input (and the schema accepts it). Ops looks up each NTM addon's product in CW's procurement catalog and pastes its ID.

**Sample matches** (for orientation; not authoritative — ops should confirm by NTM's actual addon catalog):
- Phone System → `MICROSOFT0030-MRR` (id 149) or `MICROSOFT0031-MRR` (id 150)
- Backup → `INFRASCALE0001-MRR` (id 115), `INFRASCALE0004-MRR` (id 118), `DATTO0001-MRR` (id 187)
- Onboarding line item → `NTMOnboarding0001` (id 179)
- Email Migration → `EmailMigration0001` (id 21)
- Security Awareness Training → `SAFESECURE0013-MRR` (id 184)

---

## 3. Project setup

| Need | CW ID | CwConfig key | Source |
|---|---|---|---|
| ✅ Project Type — "Customer Onboarding" | **8** | `project.typeId` | `/project/projectTypes` |
| ✅ Project Template — "Client Onboarding Template" | **2** | `project.templateId` | `/project/projectTemplates/` |
| ✅ Project Board — "Projects" (only one with `projectFlag: true`) | **20** | `project.boardId` | `/service/boards` |
| ✅ Default PM — "Kenneth Phillips" (`kphillips`) | **165** | `project.defaultManagerMemberId` | `/system/members` |
| ✅ Default duration (days) | 30 | `project.defaultDurationDays` | (config, not from CW) |
| ✅ Billing method | `FixedFee` (recommend) — sample existing project used `ActualRates` | `project.billingMethod` | (enum, no CW lookup) |

---

## 4. Agreement defaults

| Need | CW ID | CwConfig key | Source |
|---|---|---|---|
| ✅ Default Tax Code — "Out of State" (safer single default) | **13** | `agreement.defaultTaxCodeId` | `/finance/taxCodes` |
| ✅ Billing Terms — "Net 30 days" | **1** | `agreement.billTermsId` | `/finance/billingTerms` |
| ✅ Currency — "US Dollars" | **7** | `agreement.currencyId` | `/finance/currencies` |
| ✅ Department — "Services" | **1** | `agreement.departmentId` | `/system/departments` (alts: `2` Sales, `3` Admin) |
| ✅ Location — "National Technology Management" | **11** | `agreement.locationId` | `/system/locations` (alts: `2` Corporate, `20` The Tech of Southwest Michigan) |
| ✅ Bill Cycle — Monthly | **2** | `agreement.billCycleId` | (legacy hardcoded; not exposed in OpenAPI; existing seed value, observed as working) |

**Tax code note**: 8 = Michigan in-state, 13 = Out of State. For multi-state customers, the orchestrator should pick by customer state. Default `13` is a safe fallback. Phase 0 captures the default; tax-by-state is future work.

**Other tax codes available:** 1 (Exempt), 8 (MI), 13 (OOS), 14 (Exempt-OK), 15 (KS), 16 (FL), 17 (OH), 18 (Canada-Ontario).

---

## 5. Company defaults

| Need | CW ID | CwConfig key | Source |
|---|---|---|---|
| ✅ Company Type — "Prospect" | **26** | `company.typeProspectId` | `/company/companies/types` |
| ✅ Company Type — "Customer" | **40** | `company.typeCustomerId` | `/company/companies/types` |
| ✅ Company Status — "Active" | **1** | `company.statusActiveId` | `/company/companies/statuses` |
| 🟢 Market | (optional, leave unset) | `company.marketId` | `/company/marketDescriptions` (24 markets available) |

**Other company types:** 6 (Vendor), 37 (Lead), 44 (Offboarded Customer), 46 (Approval Required), 48 (Not a fit), 49 (Marketing), 50 (Referral), 51 (VIP CLIENT).

---

## 6. Opportunity reference IDs

| Need | CW ID | CwConfig key | Source |
|---|---|---|---|
| ✅ Opp Type — "Recurring Revenue" | **13** | `opportunity.typeRecurringId` | `/sales/opportunities/types` |
| ✅ Opp Status — "1. Open" | **1** | `opportunity.statusOpenId` | `/sales/opportunities/statuses` |
| ✅ Opp Status — "3. Won" | **2** | `opportunity.statusWonId` | `/sales/opportunities/statuses` |
| ✅ Opp Stage — "4. Quoted" | **5** | `opportunity.stageQuotedId` | `/sales/stages` |
| ✅ Opp Stage — "6. Won" | **6** | `opportunity.stageWonId` | `/sales/stages` |
| ✅ Default Sales Rep — "Kelly Siegel" (`KSiegel`) | **155** | `opportunity.defaultSalesRepMemberId` | `/system/members` filtered by Sales department |

**Sales rep selection:** Kelly Siegel is the only human in the Sales department (`identifier=Sales`, dept id 2) on this CW instance. Override per-quote later if NTM hires more sales reps. `Opportunity.primarySalesRep` is required by CW on POST, so this must always be set.

---

## 7. Custom field IDs (cross-reference back to Quote)

🚧 **None exist.** Audit of `/system/userDefinedFields` found 18 custom fields total, but no "Quote ID" or "Agreement Number" anywhere.

| Need | CwConfig key | Status |
|---|---|---|
| Company custom field for Quote ID | `customField.companyQuoteId` | 🚧 must be created in CW |
| Agreement custom field for Quote ID | `customField.agreementQuoteId` | 🚧 must be created in CW |
| Project custom field for Agreement Number | `customField.projectAgreementNumber` | 🚧 must be created in CW |

The `crossref` orchestration step is conditional — until these exist, it skips. Not blocking the rest of provisioning.

---

## 8. Communication item types

| Need | CW ID | CwConfig key | Source |
|---|---|---|---|
| ✅ Email - Work | **1** | `comm.emailTypeId` | `/company/communicationTypes` |
| ✅ Phone - Direct | **2** | `comm.phoneTypeId` | `/company/communicationTypes` |

(Other types available: 3 Fax-Work, 4 Phone-Mobile, 6 Phone-Home, 8 Email-Home, 9 Email-Other.)

---

## Summary of action items, in order

1. ~~Grant API key missing roles~~ ✅ Resolved — second API key issued with full read scope on the five blocked modules.
2. ~~Agreement-type strategy~~ ✅ Resolved — Essentials/SafeSecure/SafeSecure Plus → CW types 36/37/38, mapping is in `defaultPackages` and the seed backfills.
3. **NTM creates the three custom fields** (Quote ID on Company + Agreement, Agreement Number on Project) in CW. Optional for billing to work, but required for the cross-reference step.
4. **Ops fills in `cwProductId` on each Addon row** in the admin UI's per-row "CW Catalog Product ID" field. The CW catalog has 1,547 items; sample identifiers in §2 above for orientation.
5. **Decide on production write scopes** for the integrator key — currently the audit key only has read access. For the test environment to actually run end-to-end, the same key (or a separate write key) needs add/edit on Companies, Contacts, Opportunities, Agreements, AgreementAdditions, and Projects.
6. **Spin up test environment** — sandbox/staging CW + AP sandbox creds + ngrok webhook URL. Runbook to follow once write scopes are confirmed.

The seed values in `cw-config.service.ts` (DEFAULTS) have been updated with everything ✅ in this doc, so a fresh `npm run db:seed` populates the table with audited values rather than legacy guesses.
