/**
 * Azure Key Vault bootstrap — this service's secrets live in kv-ntm-apps, not
 * in Railway's variables.
 *
 * Importing this module pulls each secret in SECRETS into process.env under the
 * variable name the rest of the code already reads, so config/env.ts and
 * prisma/seed.ts stay env-driven and need no vault awareness. Vault values win
 * over anything the platform set, so a stale variable left behind on Railway
 * can never shadow the vault.
 *
 * Ordering. The load runs as a top-level await, so a module that imports this
 * one cannot evaluate until the vault has been read. config/env.ts imports it
 * for exactly that reason: ESM evaluates a *sibling* import that does not
 * depend on an awaiting module without waiting for it, so a bare
 * `import './vault.js'` at the top of index.ts would not, on its own, stop
 * env.ts from parsing process.env too early. Keep the import in env.ts (and in
 * prisma/seed.ts, which reads process.env directly). `.env` (dev:
 * `tsx --env-file=../.env`) is applied by the runtime before any module runs,
 * so the order is always .env -> vault -> env.ts.
 *
 * Configuration (all read from the environment):
 *
 *   AZURE_KEY_VAULT_URL   https://kv-ntm-apps.vault.azure.net — unset disables
 *                         the vault entirely (local dev / tests fall back to .env).
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *                         the service principal that holds Key Vault Secrets
 *                         User on the vault. Picked up by DefaultAzureCredential,
 *                         which also honours a managed identity or an `az login`
 *                         session when those three are absent.
 *
 * A vault that is configured but unreachable, or a credential that is refused,
 * is fatal: the server refuses to start rather than run on the wrong secrets.
 * A single secret missing from the vault is logged and skipped so a value that
 * has not been uploaded yet can still be supplied through the environment.
 */

const VAULT_URL_VAR = 'AZURE_KEY_VAULT_URL';

/** env var the code reads -> secret name in kv-ntm-apps. */
export const SECRETS: Readonly<Record<string, string>> = {
  JWT_SECRET: 'quoting-tool-jwt-secret',
  GHL_SSO_KEY: 'quoting-tool-ghl-sso-key',
  INITIAL_ADMIN_PASSWORD: 'quoting-tool-initial-admin-password',
};

interface SecretResult {
  envName: string;
  secretName: string;
  value?: string;
  missing?: boolean;
}

/** Key Vault answers 404 / code "SecretNotFound" for a name that does not exist. */
function isSecretNotFound(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string } | null;
  return e?.statusCode === 404 || e?.code === 'SecretNotFound';
}

function isAuthError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return (
    name === 'AuthenticationError' ||
    name === 'AggregateAuthenticationError' ||
    name === 'CredentialUnavailableError'
  );
}

/**
 * Pull every secret in SECRETS into process.env. Returns the env var names that
 * were set from the vault (empty when the vault is not configured).
 */
export async function load(): Promise<string[]> {
  const vaultUrl = (process.env[VAULT_URL_VAR] ?? '').trim();
  if (!vaultUrl) {
    console.log(`[vault] ${VAULT_URL_VAR} not set — secrets come from the environment / .env`);
    return [];
  }

  // Only pull the Azure SDKs in when a vault is actually configured.
  const [{ DefaultAzureCredential }, { SecretClient }] = await Promise.all([
    import('@azure/identity'),
    import('@azure/keyvault-secrets'),
  ]);
  const client = new SecretClient(vaultUrl, new DefaultAzureCredential());

  const results: SecretResult[] = await Promise.all(
    Object.entries(SECRETS).map(async ([envName, secretName]): Promise<SecretResult> => {
      try {
        const { value } = await client.getSecret(secretName);
        return { envName, secretName, value };
      } catch (err) {
        if (isSecretNotFound(err)) return { envName, secretName, missing: true };
        const detail = err instanceof Error ? err.message : String(err);
        if (isAuthError(err)) {
          throw new Error(
            `[vault] authentication to ${vaultUrl} failed while reading '${secretName}' — ` +
              `check AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET: ${detail}`,
            { cause: err },
          );
        }
        // network, 403 (role not assigned / firewall), throttling, ...
        throw new Error(`[vault] could not read '${secretName}' from ${vaultUrl}: ${detail}`, {
          cause: err,
        });
      }
    }),
  );

  const loaded: string[] = [];
  const missing: string[] = [];
  for (const r of results) {
    if (r.missing) {
      missing.push(r.secretName);
    } else if (r.value) {
      process.env[r.envName] = r.value;
      loaded.push(r.envName);
    }
  }

  console.log(`[vault] loaded ${loaded.length} secret(s) from ${vaultUrl}: ${loaded.join(', ') || '-'}`);
  if (missing.length) {
    console.log(`[vault] not in vault (environment fallback): ${missing.join(', ')}`);
  }
  return loaded;
}

// Top-level await: every module that imports this one waits here. A rejected
// load (vault unreachable, credential refused) is an unhandled rejection at
// module scope, which crashes the process before anything reads process.env.
export const loadedFromVault: readonly string[] = await load();
