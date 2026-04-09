# NTM Quoting Tool - Implementation TODO

## Legend
- [x] Complete
- [ ] Not started / Needs work
- [!] Needs credentials or external setup

---

## Core Quote Flow

- [x] Quote builder wizard (Landing > QuoteBuilder > Summary > Terms > QuoteReview)
- [x] Quote creation with full data snapshots (customer, package, addons, onboarding, promo codes, totals, terms)
- [x] Quote number generation (QT-YYYYMMDD-XXXX)
- [x] Quote expiration (30 day validity)
- [x] Quote retrieval by ID or quoteNumber
- [x] Quote emailing via Resend
- [x] Quote review page with full pricing breakdown
- [x] Agreement acceptance (e-signature, terms checkbox, IP capture, user agent)
- [x] Order number generation (OR-YYYYMMDD-XXXX)
- [x] Contract HTML generation with NTM branding
- [x] Contract PDF generation via Puppeteer
- [x] Contract email delivery with PDF attachment
- [x] Payment confirmation email
- [ ] Quote expiration enforcement (status never auto-set to 'expired')
- [ ] Reminder emails before quote expiration

---

## Payment System (Alternative Payments)

- [x] AP OAuth 2.0 client credentials flow with token caching
- [x] AP customer creation from quote data
- [x] AP invoice creation with line items (onboarding + one-time addons + setup fees)
- [x] AP checkout token generation (scoped JWT for Web SDK)
- [x] AP hosted payment link as primary redirect
- [x] AP payment link refresh for returning customers
- [x] AP webhook handler (invoice_paid, payment_failed)
- [x] Quote status transitions: accepted > checkout_pending > paid
- [x] Stripe fully removed (code, package, env vars)
- [!] AP_CLIENT_ID - need to verify from AP dashboard
- [!] AP_CLIENT_SECRET - key provided, need to confirm which credential it is
- [!] AP_WEBHOOK_SECRET - set when registering webhook on AP dashboard
- [ ] Register AP webhook URL (requires deployed Railway domain)
- [ ] Test AP payment flow end-to-end with real credentials
- [ ] Consider AP Web SDK inline payment (currently using hosted payment link redirect)

---

## ConnectWise Manage Integration

- [x] CW REST API client with Basic auth
- [x] Company search by name (find existing before creating)
- [x] Company creation (type: Prospect, status: Active)
- [x] Contact creation with email + phone communication items
- [x] Opportunity creation (type: Recurring Revenue, stage: 4. Quoted)
- [x] Mark opportunity as Won on payment (status: 3. Won, stage: 6. Won)
- [x] Update company type from Prospect to Customer on payment
- [x] Project creation (Onboarding - {businessName})
- [x] Agreement creation mapped to package (Essentials=36, SafeSecure=37, SafeSecure Plus=38)
- [x] Agreement additions for recurring addons
- [x] Opportunity notes on payment
- [x] Fire-and-forget error handling (never blocks user flow)
- [x] CW IDs persisted to quote (cwCompanyId, cwContactId, cwOpportunityId, cwProjectId, cwAgreementId)
- [!] CW_COMPANY_ID - need from user
- [!] CW_PUBLIC_KEY - need from user
- [!] CW_PRIVATE_KEY - need from user
- [!] CW_CLIENT_ID - need from user
- [ ] Test CW integration end-to-end with real credentials
- [ ] Verify CW communication item type IDs (currently hardcoded 1=Email, 2=Phone)
- [ ] Handle duplicate company names gracefully (currently takes first match)

---

## GoHighLevel Integration

- [x] GHL contact creation on quote creation (fire-and-forget)
- [x] GHL opportunity creation in default pipeline
- [x] GHL contact notes on quote events (created, emailed, paid)
- [x] GHL opportunity status update to 'won' on payment
- [x] GHL IDs persisted to quote (ghlContactId, ghlOpportunityId)
- [x] Legacy lead creation still works (/api/leads route)
- [x] Custom fields: userCount, locationCount, referrerCode
- [ ] GHL pipeline stage transitions (currently only open > won, no intermediate stages)
- [ ] GHL tags update on quote status changes
- [ ] Verify GHL v1 API endpoints are still current (may need v2 migration)

---

## Admin Features

- [x] Admin login/authentication (JWT)
- [x] Admin user seeding (admin@ntm.com / admin123)
- [x] Package CRUD (create, list, update, soft-delete via active flag)
- [x] Addon CRUD with dual-pricing support (recurring-only, one-time-only, both)
- [x] Promo code CRUD (percentage/fixed, expiration, max uses tracking)
- [x] Terms version management (auto-deactivate previous on create)
- [x] Audit logging
- [x] Admin quote listing with search, status filter, pagination (/admin/quotes)
- [x] Admin quote stats dashboard (total, last 30d, per-status counts)
- [x] Admin quote detail view (full quote data + integrations + contracts)
- [x] Customer quote lookup by email (/quote-lookup)
- [ ] Admin ability to manually resend quote emails
- [ ] Admin ability to view/download contract PDFs

---

## Database

- [x] PostgreSQL with Prisma ORM
- [x] Quote model with AP/CW/GHL fields
- [x] Contract model (PDF storage as Bytes)
- [x] Package, Addon, PromoCode, Terms models
- [x] AdminUser model with bcrypt password hashing
- [x] AuditLog model
- [x] Migrations: init + replace-stripe-with-ap-cw-ghl
- [x] Seed script: 3 packages, 10 addons, 2 promo codes, terms v1.0, admin user

---

## Deployment (Railway)

- [x] nixpacks.toml configured (Chromium, Prisma generate, migrate deploy)
- [x] .env.example with all required variables
- [x] Production build: shared > client > server
- [x] Server serves client dist in production mode
- [ ] Create Railway project
- [ ] Add Railway native Postgres database
- [ ] Set all environment variables in Railway dashboard
- [ ] Deploy and verify
- [ ] Register AP webhook URL with Railway domain
- [ ] Configure custom domain/DNS
- [ ] Generate secure JWT_SECRET for production
- [ ] Test PDF generation works with Railway's Chromium

---

## Known Issues / Tech Debt

### High Priority
- [ ] Quote expiration enforcement - expiresAt is set but never checked before checkout
- [ ] Contract route (/api/contracts/:quoteId/generate) has no auth middleware - anyone could trigger PDF generation
- [ ] AP webhook secret verification is optional - should be required in production
- [ ] No rate limiting on public endpoints (/api/quotes, /api/leads, /api/quotes/lookup/by-email)

### Medium Priority
- [ ] No CORS restriction in production (currently defaults to undefined origin)
- [ ] No retry logic for failed CW/GHL API calls
- [ ] No admin notification when CW/GHL integrations fail silently
- [ ] Leads system isolated - no admin UI to view captured leads
- [ ] Admin ability to manually resend quote emails
- [ ] Admin ability to view/download contract PDFs from the quotes page

### Low Priority
- [ ] Promo code validation endpoint exists but isn't used in QuoteReview page (only in Summary)
- [ ] No quote editing capability (admin or customer)
- [ ] No reminder emails before quote expiration
- [ ] No analytics/reporting dashboard (conversion rates, revenue tracking)
- [ ] GHL pipeline stage transitions (currently only open > won)
- [ ] GHL v1 API may need migration to v2

---

## Tomorrow - Testing & Validation Checklist

### End-to-End Flow Testing
- [ ] Test full PDF contract generation (Puppeteer rendering, content accuracy, layout)
- [ ] Test e-signature capture and agreement signing flow
- [ ] Test Purchase Now button → AP checkout → payment completion
- [ ] Test AP payment webhook callback → quote marked paid → contract generated → emails sent
- [ ] Test sales rep / referrer codes - verify they flow through to CW and GHL

### Integration Testing
- [ ] ConnectWise: Verify company creation (Prospect type, correct fields)
- [ ] ConnectWise: Verify contact creation (email, phone, linked to company)
- [ ] ConnectWise: Verify opportunity creation (stage: Quoted, correct amounts)
- [ ] ConnectWise: Verify opportunity marked Won on payment
- [ ] ConnectWise: Verify project creation on payment (Onboarding project)
- [ ] ConnectWise: Verify agreement creation on payment (mapped to package type)
- [ ] GHL: Verify contact created/updated (email lookup first)
- [ ] GHL: Verify opportunity created in correct pipeline
- [ ] GHL: Verify contact notes logged (created, emailed, paid)
- [ ] GHL: Verify opportunity marked Won on payment
- [ ] Alternative Payments: Test full payment capture end-to-end
- [ ] Resend: Verify quote email delivery with verified domain

### UI / Page Fixes
- [ ] Fix landing page design/copy (needs refresh)
- [ ] Verify all cost breakdowns are accurate across Summary and QuoteReview pages

### Data & Configuration
- [ ] Map CW product IDs to packages (preload into package config or add a cwProductId field)
- [ ] Add a 4th package option to match CW agreement types if needed
- [ ] Verify promo code apply/remove works correctly in all scenarios

---

## Future Enhancements

### AI Features
- [ ] AI-powered quote recommendations based on customer size/industry
- [ ] Internal AI chat to create quotes conversationally ("Create a quote for 10 users, SafeSecure package, with premium support")
- [ ] AI-generated quote summaries and email copy
- [ ] Smart pricing suggestions based on historical quote data

### Other
- [ ] Analytics/reporting dashboard (conversion rates, revenue tracking, funnel metrics)
- [ ] Admin ability to manually create quotes for customers
- [ ] Quote versioning (allow edits that create a new version)
- [ ] Reminder emails before quote expiration
- [ ] Customer portal for managing their quotes and agreements

---

## Credentials Checklist (Before Go-Live)

| Service | Credential | Status |
|---------|-----------|--------|
| Alternative Payments | AP_CLIENT_ID | Needs verification |
| Alternative Payments | AP_CLIENT_SECRET | Have key, need to confirm type |
| Alternative Payments | AP_WEBHOOK_SECRET | Need to register webhook |
| ConnectWise | CW_COMPANY_ID | Need from user |
| ConnectWise | CW_PUBLIC_KEY | Need from user |
| ConnectWise | CW_PRIVATE_KEY | Need from user |
| ConnectWise | CW_CLIENT_ID | Need from user |
| GoHighLevel | GHL_API_KEY | Configured |
| GoHighLevel | GHL_LOCATION_ID | Configured |
| Resend | RESEND_API_KEY | Configured |
| Railway | DATABASE_URL | Set on deploy |
| App | JWT_SECRET | Generate for production |
