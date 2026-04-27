# Test Environment Runbook

Stand up the quoting tool locally and walk it through the **1 location / 25 users / Voice-for-10** scenario from `Obsidian-Vault/Projects/ntm_quoting_tool-workflow-example.md`.

Three test "levels" — start at Level 1, only proceed to 2/3 once 1 works.

| Level | What it validates | What you need |
|---|---|---|
| **1. UI smoke** | Schema, wizard, admin UI, quote DB row | Local Node + Postgres only |
| **2. CW dry-run** | Full orchestrator logic without touching real CW | Above + `CW_DRY_RUN=true` |
| **3. End-to-end** | Real CW writes + real AP payment | Above + AP sandbox + ngrok + write-enabled CW key |

---

## Prerequisites (one-time install)

In an **admin** PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.17
winget install ngrok.ngrok    # only needed for Level 3
```

Restart your shell after install. Verify:

```powershell
node --version    # should print v20.x or v22.x
psql --version    # already there: 18.3
ngrok version
```

The Postgres installer prompts for a superuser password — remember it.

---

## Level 1 — UI smoke test

### 1. Create the database

```powershell
$env:PGPASSWORD = '<your postgres superuser password>'
psql -U postgres -c "CREATE DATABASE quoting_dev;"
```

### 2. Create `.env` at the repo root

`C:\Github\ntm_quoting_tool\.env`:

```dotenv
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/quoting_dev
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:8080
JWT_SECRET=local-dev-only-change-in-prod-please-make-this-long-enough

INITIAL_ADMIN_EMAIL=admin@ntm.local
INITIAL_ADMIN_PASSWORD=changeme123

# Level 1: all integrations disabled. The orchestrator no-ops cleanly when these are blank.
AP_CLIENT_ID=
AP_CLIENT_SECRET=
AP_WEBHOOK_SECRET=
RESEND_API_KEY=
FROM_EMAIL=quotes@trustntm.com
GHL_API_KEY=
GHL_LOCATION_ID=

CW_COMPANY_ID=
CW_PUBLIC_KEY=
CW_PRIVATE_KEY=
CW_CLIENT_ID=
CW_BASE_URL=https://api-na.myconnectwise.net/v4_6_release/apis/3.0
CW_DRY_RUN=false

CW_RETRY_DISABLED=true
```

### 3. Install, migrate, seed

```powershell
cd C:\Github\ntm_quoting_tool
npm install
cd server
npx prisma generate
npx prisma migrate deploy
npm run db:seed
cd ..
```

### 4. Run the dev server

```powershell
npm run dev
```

Two ports:
- **client (Vite):** http://localhost:8080
- **server (Express):** http://localhost:3001

### 5. Walk the customer flow

1. Open http://localhost:8080
2. Click "Get Started"
3. **Quote Builder** → pick **SafeSecure**
4. **Summary** → fill in:
   - Name: Test User
   - Email: youremail@yourdomain.test
   - Phone: 555-0100
   - Business Name: **Acme Inc**
   - Address: 123 Main St
   - **User Count: 25**
   - **Location Count: 1**
5. Pick the **Phone System** add-on, **quantity 10**
6. Verify the totals match the Obsidian doc:
   - Recurring: **$1,624/mo**
   - One-time today: **$10,000**
7. **Terms** → check "I accept" → Continue
8. **Quote Review** → e-sign → click **Save Quote**

### 6. Verify in DB and admin UI

In a new shell:

```powershell
$env:PGPASSWORD = '<password>'
psql -U postgres -d quoting_dev -c "SELECT \"quoteNumber\", status, \"provisioningStatus\", \"cwCompanyId\" FROM quotes ORDER BY \"createdAt\" DESC LIMIT 5;"
```

Expected: one row, `status=draft`, `provisioningStatus=pending`, `cwCompanyId=NULL` (CW is disabled).

Then admin UI:
- http://localhost:8080/admin/login → admin@ntm.local / changeme123
- `/admin/quotes` — see the quote row
- `/admin/cw-reference-ids` — see all CW config keys, all required ones marked
- `/admin/packages` — see Essentials/SafeSecure/SafeSecure Plus with `cwAgreementTypeId` 36/37/38

⛳ **Stop here if Level 1 looks right.** Next level adds CW.

---

## Level 2 — CW dry-run

Validates that the orchestrator runs all 11 steps end-to-end against real CW reads, but **doesn't write** anything to CW. Useful to confirm reference IDs are right, packages map correctly, and step state is recorded.

### 1. Update `.env`

```dotenv
CW_COMPANY_ID=ntm
CW_PUBLIC_KEY=<paste from 1Password / CW integrator key>
CW_PRIVATE_KEY=<paste from 1Password / CW integrator key>
CW_CLIENT_ID=<paste from CW developer console>
CW_BASE_URL=https://api-na.myconnectwise.net/v4_6_release/apis/3.0
CW_DRY_RUN=true
```

> Never commit real keys to this file. They live in your local `.env` (gitignored) or in Railway's environment-variable UI.

Restart `npm run dev`.

### 2. Walk the same customer flow as Level 1

After clicking Save Quote, the server logs will show entries like:

```
[CW DRY RUN] POST /company/companies (would have sent body, returning fake id 942817453)
[CW DRY RUN] POST /company/contacts ...
[CW DRY RUN] POST /sales/opportunities ...
```

### 3. Verify step state

```powershell
psql -U postgres -d quoting_dev -c "SELECT step, status, \"cwId\", \"lastError\" FROM cw_provisioning_steps ORDER BY \"updatedAt\";"
```

Expected: rows for `company`, `contact`, `opportunity` all `status=success` with cwId in the 900M+ range (the dry-run sentinel).

### 4. Trigger payment-completed manually (no real AP needed)

To exercise the rest of the orchestrator (agreement, additions, activate, project, crossref, handoff):

```powershell
# From server/
tsx scripts/cw-dry-run.ts QT-<your-quote-number>
```

Output shows per-step status. All should be `success` (or `skipped` for `crossref` because the custom fields don't exist).

⛳ **Stop here if dry-run passes.** Next level wires real money + real CW writes.

---

## Level 3 — End-to-end with AP sandbox

Validates real payment capture and real CW provisioning. **Will create real CW objects** under the company name you put in the wizard, so use a clearly-fake company name like "Acme Inc - TEST".

### 1. Get AP sandbox credentials

Email `support@alternativepayments.io` and ask for sandbox API credentials + a webhook secret. They should provide a separate `https://sandbox.api.alternativepayments.io` base URL — note we may need to make that configurable in `ap.service.ts` (currently hardcoded to production).

### 2. Get write-enabled CW key

The current API key is read-only. Have your CW admin grant write access on:
- `/company/companies` (PATCH)
- `/company/contacts` (POST)
- `/sales/opportunities` (POST/PATCH)
- `/sales/opportunities/{id}/notes` (POST)
- `/finance/agreements` (POST/PATCH)
- `/finance/agreements/{id}/additions` (POST)
- `/project/projects` (POST/PATCH)

Either upgrade the existing read-only audit key or issue a separate write-enabled one. Update `.env` with whichever.

### 3. Have ops create the three custom fields in CW

(Optional but recommended for the cross-reference step.)
- Company → "Quote ID" text field
- Agreement → "Quote ID" text field
- Project → "Agreement Number" text field

Once created, find their IDs via `GET /system/userDefinedFields?conditions=caption='Quote ID'` and set `customField.companyQuoteId`, `customField.agreementQuoteId`, `customField.projectAgreementNumber` in `/admin/cw-reference-ids`.

### 4. Have ops set `cwProductId` on each NTM addon

Visit `/admin/addons` and paste the CW catalog product ID for every addon. Without these, recurring agreements won't get the addon as a line item (the `additions` step will fail with "Missing cwProductId for addons: …").

### 5. Run ngrok for AP webhook delivery

```powershell
ngrok http 3001
```

Copy the HTTPS forwarding URL (e.g. `https://abc123.ngrok-free.app`). Register it in the AP dashboard as the webhook target: `<that url>/api/webhooks/ap`.

### 6. Update `.env`

```dotenv
CW_DRY_RUN=false
CW_RETRY_DISABLED=false
AP_CLIENT_ID=<sandbox client id>
AP_CLIENT_SECRET=<sandbox client secret>
AP_WEBHOOK_SECRET=<from AP dashboard>
RESEND_API_KEY=<your prod or test Resend key>
```

Restart `npm run dev`.

### 7. Walk through with a fake test customer

Use a clearly-fake business name (e.g., "ZZZ TEST - delete me - 2026-04-27"). Click Purchase Now, complete payment with the AP-provided test card.

### 8. Watch logs and CW

You should see, in order:
1. Server log: `[AP] customer/invoice/checkout created`
2. Browser redirects to AP hosted checkout
3. AP completes → redirects to `/payment-success`
4. AP webhook hits ngrok → server processes
5. Server logs each CW step
6. CW shows: Customer "ZZZ TEST", Won opportunity, Active SafeSecure agreement, Onboarding project

### 9. Cleanup

In CW UI: archive the test company, cancel the agreement, delete the project. Or leave them with the obvious "TEST" name and let them age out.

---

## Troubleshooting

**`prisma migrate deploy` says "database is empty / no migrations applied"** → that's fine on first run; migrations will be applied. If it errors with permission, try `migrate dev` instead.

**Vite says "EADDRINUSE :8080"** → another process owns 8080; either kill it or change `vite.config.ts`.

**Server logs `[CW] Not configured — skipping`** → CW env vars not set. Either expected (Level 1) or add them to `.env`.

**`prisma migrate dev` complains about drift** → safe on a fresh DB; if it's an existing one, check what's drifted before resetting.

**Prisma client generation fails on Windows** → close any running `npm run dev` first; Prisma can't overwrite the generated client while it's loaded.

**ngrok URL keeps changing** → free-tier ngrok rotates the URL each restart. For longer test sessions, use the paid `--domain=<reserved>` flag, or use Cloudflare Tunnel as a free alternative.
