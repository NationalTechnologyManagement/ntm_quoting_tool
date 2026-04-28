# Test / Deploy Environment

Workflow is **Railway-first**: every change ships via `git push origin master`. There is no local dev step. The Railway service `ntm-quoting-tool` (project `Connectwise-Services`, service id `b42f7ec7-89a1-4369-874f-2a1dc4b9a1e8`) auto-builds on push and runs migrations + seed on each deploy.

## Environments

| | URL | Postgres |
|---|---|---|
| Production | https://ntm-quoting-tool-production.up.railway.app | Railway service `Quoting tool` (private DNS: `postgres-fxf8.railway.internal`) |

There is no separate staging environment. To run an experiment, branch off, push, and use `CW_DRY_RUN=true` so CW writes are stubbed.

---

## Build pipeline

1. **Trigger:** push to `master` (Railway auto-detects via GitHub integration).
2. **Build phases** (defined in `nixpacks.toml`):
   - `setup` — apt-installs `chromium` for Puppeteer PDF generation.
   - `install` — `npm install --include=dev`. Lenient on lockfile drift so dev-dep changes don't require a local `npm install`.
   - `build` —
     1. `npm run build --workspace=shared` (TS compile)
     2. `npm run build --workspace=client` (Vite production bundle)
     3. `cd server && npx prisma generate` (Prisma client codegen)
     4. `npm run build --workspace=server` (TS compile)
3. **Start command** (defined in `railway.json`):
   ```
   cd server && npx prisma migrate deploy && npx tsx prisma/seed.ts && cd .. && npm start
   ```
   - `migrate deploy` applies pending migrations (idempotent — re-applying produces no-ops)
   - `seed` upserts default packages, addons, promo codes, terms, admin user, and CW config keys. Existing rows are preserved (`update: {}` in seed).
4. **Health check:** `/health` returns 200 if Postgres is reachable, 503 otherwise. Railway gates traffic on this.

Failure modes and how they manifest in logs:
- **Lockfile / dep mismatch** → fails at `install` phase. Fix: change to a more lenient install (`npm install` already used).
- **TS compile error** → fails at `build`. Pull build logs via Railway dashboard or GraphQL.
- **Prisma migration error** → fails at start. Check logs for the migration name.
- **Seed error** → start fails after migrate. Usually a data shape mismatch; check the failing upsert.
- **Healthcheck timeout** → app process started but `/health` not 200. Likely DATABASE_URL wrong or Postgres unreachable.

---

## Environment variables

Set via Railway dashboard or GraphQL. Categories:

### Core (must be set, already set)
- `DATABASE_URL` → `${{Quoting tool.DATABASE_URL}}` (Railway reference; internal DNS, no public exposure)
- `NODE_ENV=production`
- `JWT_SECRET=<64-char random hex>` (rotate by setting a new value; existing admin sessions invalidate)
- `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (used only when no admin user exists yet)
- `FROM_EMAIL=quotes@trustntm.com`
- `FRONTEND_URL=${{RAILWAY_PUBLIC_DOMAIN}}`

### CW (currently in dry-run; flip when ready)
- `CW_BASE_URL`, `CW_COMPANY_ID`, `CW_CLIENT_ID`, `CW_PUBLIC_KEY`, `CW_PRIVATE_KEY`
- `CW_DRY_RUN=true` — set this back to `false` (or remove) once the API key has write scopes and you've confirmed real test data lands correctly. While `true`, the orchestrator runs end-to-end but every non-GET to CW is logged as `[CW DRY RUN] POST ...` and returns a fake id so step state still progresses.
- `CW_RETRY_DISABLED=true` — keep `true` while in dry-run; the retry worker has no value when CW writes are stubbed.

### AP, GHL, Resend (set when those flows are needed)
- `AP_CLIENT_ID`, `AP_CLIENT_SECRET`, `AP_WEBHOOK_SECRET` — leave blank to disable Purchase Now button.
- `GHL_API_KEY`, `GHL_LOCATION_ID` — leave blank to skip GHL contact/opportunity creation.
- `RESEND_API_KEY` — leave blank to skip email sending (quote save still works, just no email).

### Notifications (optional)
- `NOTIFY_WEBHOOK_URL` — Slack/Teams webhook for provisioning lifecycle pings.

---

## Common operations

### Watch a deploy

Railway dashboard: project `Connectwise-Services` → service `ntm-quoting-tool` → Deployments. Status one of `INITIALIZING / BUILDING / DEPLOYING / SUCCESS / FAILED / CRASHED`.

### Pull recent build logs (when a deploy fails)

Easiest: Railway dashboard. For programmatic access, the GraphQL API at `https://backboard.railway.com/graphql/v2` with `Authorization: Bearer <token>` and a `buildLogs(deploymentId, limit, filter)` query returns logs filtered by severity.

### Pull runtime logs

`railway logs` (CLI) when linked to the service, or via the dashboard.

### Inspect the database

`DATABASE_PUBLIC_URL` is exposed as a TCP proxy by Railway:
```
postgresql://postgres:<password>@switchback.proxy.rlwy.net:19172/railway
```
Connect with `psql` (already installed on the user's machine):
```powershell
$env:PGPASSWORD = '<from Railway dashboard>'
psql -h switchback.proxy.rlwy.net -p 19172 -U postgres -d railway -c "SELECT \"quoteNumber\", status, \"provisioningStatus\" FROM quotes ORDER BY \"createdAt\" DESC LIMIT 10;"
```

### Force a redeploy (no code change)

Railway dashboard → Deployments → "Redeploy" on the latest. Or via CLI / GraphQL `serviceInstanceRedeploy`.

### Roll back

Railway dashboard → Deployments → click an old SUCCESS deployment → "Redeploy". This re-uses the Docker image of that earlier build.

### Test mode walkthrough (no real money, no real CW writes)

1. Confirm `CW_DRY_RUN=true` on the service.
2. Confirm AP credentials are blank (so Purchase Now stays disabled).
3. Visit https://ntm-quoting-tool-production.up.railway.app
4. Walk the wizard with the example: 1 location, 25 users, Phone System × 10. Should display $1,624/mo + $10,000 first invoice.
5. Save Quote — check `/admin/quotes` (login: env `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`).
6. Verify CW step rows in DB:
   ```
   psql ... -c "SELECT step, status, \"cwId\" FROM cw_provisioning_steps ORDER BY \"updatedAt\";"
   ```
   Expect `company`, `contact`, `opportunity` rows with `cwId` in the 900M+ range (dry-run sentinel).

### Going live (real CW writes)

When ready:
1. Have CW admin grant the integrator key write scopes on Companies, Contacts, Opportunities, Agreements, AgreementAdditions, Projects.
2. In `/admin/cw-reference-ids`, fill in the three Quote ID custom field IDs (after ops creates the fields in CW).
3. In `/admin/addons`, set `cwProductId` per addon from CW's procurement catalog.
4. In `/admin/packages`, confirm `cwAgreementTypeId` is 36/37/38 for Essentials/SafeSecure/SafeSecure Plus (seeded by default).
5. Set `CW_DRY_RUN=false` and `CW_RETRY_DISABLED=false` on the Railway service.
6. Trigger a redeploy so the env vars take effect.
7. Run a quote with a clearly-fake company name to validate before real customers.

### Going live (real AP payments)

Separately:
1. Get AP sandbox creds from `support@alternativepayments.io`. Set `AP_CLIENT_ID`, `AP_CLIENT_SECRET`, `AP_WEBHOOK_SECRET`.
2. Register the webhook URL in the AP dashboard: `https://ntm-quoting-tool-production.up.railway.app/api/webhooks/ap`. AP doesn't need ngrok — Railway gives a public URL out of the box.
3. Walk the wizard, click Purchase Now, complete payment with AP test card, watch logs for the webhook → CW provisioning chain.

---

## Why no local dev

Per [memory: Railway-first workflow](file:///C:/Users/GeneAldaco/.claude/projects/C--Github/memory/feedback_railway_first_workflow.md): the user does not run code locally. Build configs must tolerate lockfile drift. Tests, dry-run scripts, and `npm install` instructions are dead code for this workflow. All validation happens on Railway.
