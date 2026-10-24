# NTM Quoting Tool

npm-workspaces monorepo — `shared`, `client` (Vite + React) and `server`
(Express + Prisma) — deployed to Railway as the single service
**ntm-quoting-tool**. Package-level docs: [`client/README.md`](client/README.md),
[`ds-bundle/README.md`](ds-bundle/README.md); Railway-first ops runbook:
[`docs/test-environment.md`](docs/test-environment.md).

## Secrets (Azure Key Vault)

The server's own secrets are not stored on the host. On boot,
`server/src/vault.ts` reads them from the **kv-ntm-apps** Key Vault (resource
group `rg-ntm-secrets`) and writes each one into the process environment under
the variable name the code already uses, so `config/env.ts` and
`prisma/seed.ts` stay env-driven. The vault wins over anything Railway has set.

| Environment variable     | Vault secret                           | Read by                              |
| ------------------------ | -------------------------------------- | ------------------------------------ |
| `JWT_SECRET`             | `quoting-tool-jwt-secret`              | admin auth, chat cookie fallback     |
| `GHL_SSO_KEY`            | `quoting-tool-ghl-sso-key`             | `/sso/ghl` embedded SSO              |
| `INITIAL_ADMIN_PASSWORD` | `quoting-tool-initial-admin-password`  | `prisma/seed.ts` on every deploy     |

`vault.ts` loads with a top-level `await`, and `config/env.ts` imports it, so
nothing can parse `process.env` before the vault has answered. A secret that is
missing from the vault is logged under `not in vault (environment fallback)`
and skipped; a vault that is configured but unreachable, or a credential that
is refused, aborts the boot. With `AZURE_KEY_VAULT_URL` unset (local dev,
tests) the loader is a no-op and everything comes from `.env`.

Only these four variables stay on the platform (Railway):

```env
AZURE_KEY_VAULT_URL=https://kv-ntm-apps.vault.azure.net
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
```

The vault firewall denies by default and admits only this service's Railway
**Static Outbound IPs** (Settings > Networking on the service) plus admin
workstations. If the service moves region or static IPs are toggled, the new
addresses must be added to the vault's network rules before the next deploy,
or boot fails with a 403 from the vault.

Integration credentials (ConnectWise, Alternative Payments, GoHighLevel API,
Resend, OpenRouter, ...) are **not** in the vault: they live in the
`integration_credentials` table, editable from `/admin/integrations`, with the
environment as first-boot fallback (`services/integration-credentials.service.ts`).
Non-secret configuration (`DATABASE_URL`, `PORT`, `FRONTEND_URL`, `CW_BASE_URL`,
...) remains ordinary environment variables.
