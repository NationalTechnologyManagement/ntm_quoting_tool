# NTM Quoting Tool — client (Vite + React + TypeScript)

The customer-facing wizard plus the internal admin UI. Built with Vite, React, TypeScript, Tailwind, and shadcn/ui.

This package is a workspace member of the root `ntm-quoting-tool` repo. The full app (client + server + shared) is deployed to Railway as a single service. There is no local dev workflow — see [`../docs/test-environment.md`](../docs/test-environment.md) for the Railway-first ops runbook.

## Pages

- `/` Landing
- `/quote-builder` Package picker
- `/summary` Customer info + addons + totals
- `/terms` Terms acceptance
- `/quote-review` E-signature + Purchase
- `/payment-success` / `/payment-cancelled` AP redirect targets
- `/admin/login` `/admin/quotes` `/admin/packages` `/admin/addons` `/admin/promo-codes` `/admin/terms` `/admin/integrations` `/admin/cw-reference-ids`

## Data sources

- Packages, addons, promo codes, terms — fetched from `/api/config` (server route). Falls back to constants in `src/contexts/QuoteContext.tsx` if the API is unreachable.
- Quote state — `QuoteContext` for the wizard.
- Auth — `AuthContext` (JWT in localStorage).
