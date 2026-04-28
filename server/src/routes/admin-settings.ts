import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import {
  getCwConfigRaw,
  setCwConfig,
  isCwConfigKey,
  REQUIRED_KEYS_FOR_PROVISIONING,
  CW_CONFIG_KEYS,
} from '../services/cw-config.service.js';
import { randomBytes } from 'crypto';
import {
  cred,
  getAllCredentials,
  setCredential,
  deleteCredential,
  isCredentialKey,
  INTEGRATION_CREDENTIAL_KEYS,
} from '../services/integration-credentials.service.js';
import { resetAPTokenCache } from '../config/ap.js';

const router = Router();

// Get integration status (uses cred() so DB overrides reflect immediately)
router.get('/api/admin/settings/integrations', requireAuth, async (_req, res) => {
  res.json({
    ap: {
      configured: !!(cred('AP_CLIENT_ID') && cred('AP_CLIENT_SECRET')),
      hasWebhookSecret: !!cred('AP_WEBHOOK_SECRET'),
    },
    cw: {
      configured: !!(cred('CW_COMPANY_ID') && cred('CW_PUBLIC_KEY') && cred('CW_PRIVATE_KEY') && cred('CW_CLIENT_ID')),
      companyId: cred('CW_COMPANY_ID') || null,
      baseUrl: cred('CW_BASE_URL') || env.CW_BASE_URL,
    },
    ghl: {
      configured: !!cred('GHL_API_KEY'),
      locationId: cred('GHL_LOCATION_ID') || null,
    },
    email: {
      configured: !!cred('RESEND_API_KEY'),
      fromEmail: cred('FROM_EMAIL') || (cred('FROM_EMAIL') || env.FROM_EMAIL),
    },
  });
});

// ── Editable integration credentials ────────────────────────────────

// GET (masked by default, ?reveal=1 returns raw values for editing)
router.get('/api/admin/settings/credentials', requireAuth, async (req, res) => {
  const reveal = req.query.reveal === '1' || req.query.reveal === 'true';
  const rows = await getAllCredentials(reveal);
  res.json({ keys: INTEGRATION_CREDENTIAL_KEYS, rows });
});

const credUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.string(), // empty string clears the override and falls back to env
  notes: z.string().nullable().optional(),
});

router.put(
  '/api/admin/settings/credentials',
  requireAuth,
  validate(credUpdateSchema),
  async (req, res) => {
    const { key, value, notes } = req.body as z.infer<typeof credUpdateSchema>;
    if (!isCredentialKey(key)) {
      res.status(400).json({ error: `Unknown credential key: ${key}` });
      return;
    }
    if (value === '') {
      await deleteCredential(key);
    } else {
      await setCredential(key, value, notes ?? null);
    }
    // Reset AP token cache so the new client_id/secret get used on next AP call.
    if (key.startsWith('AP_')) resetAPTokenCache();
    res.json({ success: true });
  },
);

// Test GHL connection
router.post('/api/admin/settings/integrations/ghl/test', requireAuth, async (_req, res) => {
  if (!cred('GHL_API_KEY')) {
    res.json({ success: false, error: 'GHL API key not configured' });
    return;
  }

  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${cred('GHL_LOCATION_ID')}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${cred('GHL_API_KEY')}`,
          Version: '2021-07-28',
        },
      },
    );

    if (response.ok) {
      res.json({ success: true, message: 'Connected to GoHighLevel successfully' });
    } else {
      const text = await response.text();
      res.json({ success: false, error: `GHL returned ${response.status}: ${text}` });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Test CW connection
router.post('/api/admin/settings/integrations/cw/test', requireAuth, async (_req, res) => {
  const companyId = cred('CW_COMPANY_ID');
  const pub = cred('CW_PUBLIC_KEY');
  const priv = cred('CW_PRIVATE_KEY');
  const clientId = cred('CW_CLIENT_ID');
  const baseUrl = cred('CW_BASE_URL') || env.CW_BASE_URL;
  if (!companyId || !pub || !priv || !clientId) {
    res.json({ success: false, error: 'ConnectWise credentials not fully configured' });
    return;
  }

  try {
    const credentials = Buffer.from(`${companyId}+${pub}:${priv}`).toString('base64');

    const response = await fetch(`${baseUrl}/system/info`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        clientId,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, message: `Connected to ConnectWise: ${data.companyName || 'OK'}` });
    } else {
      const text = await response.text();
      res.json({ success: false, error: `CW returned ${response.status}: ${text}` });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Test Resend connection (use /emails endpoint which send-only keys can access)
router.post('/api/admin/settings/integrations/email/test', requireAuth, async (_req, res) => {
  if (!cred('RESEND_API_KEY')) {
    res.json({ success: false, error: 'Resend API key not configured' });
    return;
  }

  try {
    // Send-only keys can't list domains or API keys, so just validate by checking the key format
    // and attempting a dry-run style check
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cred('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      // Send with invalid "to" to validate the key without actually sending
      body: JSON.stringify({ from: (cred('FROM_EMAIL') || env.FROM_EMAIL), to: 'test@validation.check', subject: 'test', html: 'test' }),
    });

    if (response.ok) {
      // Unlikely but key works and email was sent
      res.json({ success: true, message: `Connected to Resend. Sending from: ${(cred('FROM_EMAIL') || env.FROM_EMAIL)}` });
    } else {
      const data = await response.json().catch(() => ({}));
      // 401 = bad key, 403 = domain not verified, 422 = validation error (key is valid!)
      if (response.status === 422 || response.status === 403) {
        const domainIssue = response.status === 403 || data.message?.includes('verify');
        res.json({
          success: !domainIssue,
          message: domainIssue
            ? `Resend key valid but sending domain not verified. Verify ${(cred('FROM_EMAIL') || env.FROM_EMAIL).split('@')[1]} at resend.com/domains`
            : `Connected to Resend. Sending from: ${(cred('FROM_EMAIL') || env.FROM_EMAIL)}`,
        });
      } else if (response.status === 401) {
        res.json({ success: false, error: 'Invalid Resend API key' });
      } else {
        res.json({ success: false, error: `Resend returned ${response.status}: ${data.message || 'Unknown error'}` });
      }
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// AP API: docs at https://docs.alternativepayments.io/api-reference/webhooks
// - Endpoints live at /webhooks (no /v1 prefix)
// - One webhook per topic; topic is a single string, not an array
// - secret_key is supplied BY US on subscribe — AP signs callback deliveries
//   with `Authorization: Bearer <secret_key>` and only returns
//   `secret_last_4_digits` on read (so the secret is unrecoverable once set).
//   Hence: we generate AP_WEBHOOK_SECRET once and pass it to every webhook
//   registration, keeping the secret authoritatively in our DB.

const AP_API_BASE = 'https://public-api.alternativepayments.io';
const DEFAULT_AP_TOPICS = ['invoice_paid', 'payment_failed'];

async function getAPToken(): Promise<string> {
  const apClientId = cred('AP_CLIENT_ID');
  const apClientSecret = cred('AP_CLIENT_SECRET');
  if (!apClientId || !apClientSecret) {
    throw new Error('AP_CLIENT_ID / AP_CLIENT_SECRET not set');
  }
  const tokenCreds = Buffer.from(`${apClientId}:${apClientSecret}`).toString('base64');
  const tokenRes = await fetch(`${AP_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${tokenCreds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=webhooks:read webhooks:write',
  });
  if (!tokenRes.ok) {
    throw new Error(`OAuth failed (${tokenRes.status}): ${await tokenRes.text().catch(() => '')}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

// List webhook subscriptions currently registered with AP.
router.post('/api/admin/integrations/ap/webhooks/discover', requireAuth, async (_req, res) => {
  try {
    const token = await getAPToken();
    const r = await fetch(`${AP_API_BASE}/webhooks`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep raw */ }
    res.status(r.status).json({ status: r.status, body });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'AP discover failed' });
  }
});

// Register webhook(s) with AP. One subscription per topic (AP rules).
// If AP_WEBHOOK_SECRET isn't set we mint a fresh strong secret and save it,
// then pass that to every subscribe request. Returns the per-topic results
// and the secret we used (or `null` if it was already set — masked in
// /admin/integrations otherwise).
router.post('/api/admin/integrations/ap/webhooks/register', requireAuth, async (req, res) => {
  try {
    // Build a fully-qualified webhook URL. Railway exposes FRONTEND_URL as
    // just the hostname (no scheme); AP rejects URLs without https://, so
    // normalize defensively.
    function ensureHttps(raw: string): string {
      const stripped = raw.replace(/\/$/, '').trim();
      if (/^https?:\/\//i.test(stripped)) return stripped;
      return `https://${stripped}`;
    }
    const baseUrl = req.body?.url
      ? String(req.body.url)
      : `${env.FRONTEND_URL || ''}/api/webhooks/ap`;
    const targetUrl = ensureHttps(baseUrl);
    const topics = (req.body?.events as string[] | undefined) || DEFAULT_AP_TOPICS;

    let secret = cred('AP_WEBHOOK_SECRET');
    let secretGenerated = false;
    if (!secret) {
      secret = randomBytes(32).toString('hex');
      await setCredential('AP_WEBHOOK_SECRET', secret, 'Generated via webhook register tool');
      secretGenerated = true;
    }

    const token = await getAPToken();

    const results: Array<{ topic: string; status: number; body: unknown }> = [];
    for (const topic of topics) {
      const r = await fetch(`${AP_API_BASE}/webhooks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint_url: targetUrl, topic, secret_key: secret }),
      });
      const text = await r.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep raw */ }
      results.push({ topic, status: r.status, body });
    }

    res.json({
      endpoint_url: targetUrl,
      secretGenerated,
      // Only echo back the new secret if we just minted it; otherwise keep
      // it in the credentials editor (where it stays masked).
      secret: secretGenerated ? secret : null,
      results,
    });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'AP register failed' });
  }
});

// Test AP connection
router.post('/api/admin/settings/integrations/ap/test', requireAuth, async (_req, res) => {
  const apClientId = cred('AP_CLIENT_ID');
  const apClientSecret = cred('AP_CLIENT_SECRET');
  if (!apClientId || !apClientSecret) {
    res.json({ success: false, error: 'Alternative Payments credentials not configured' });
    return;
  }

  try {
    const credentials = Buffer.from(`${apClientId}:${apClientSecret}`).toString('base64');
    const response = await fetch('https://public-api.alternativepayments.io/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (response.ok) {
      res.json({ success: true, message: 'Connected to Alternative Payments (OAuth token obtained)' });
    } else {
      const text = await response.text();
      res.json({ success: false, error: `AP returned ${response.status}: ${text}` });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// ── CW reference config ─────────────────────────────────────────────
// Editable key/value store backing the CW orchestration. See docs/cw-reference-ids.md.

router.get('/api/admin/settings/cw-config', requireAuth, async (_req, res) => {
  const rows = await getCwConfigRaw();
  res.json({
    keys: CW_CONFIG_KEYS,
    requiredForProvisioning: REQUIRED_KEYS_FOR_PROVISIONING,
    rows,
  });
});

const cwConfigUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  notes: z.string().nullable().optional(),
});

router.put(
  '/api/admin/settings/cw-config',
  requireAuth,
  validate(cwConfigUpdateSchema),
  async (req, res) => {
    const { key, value, notes } = req.body as z.infer<typeof cwConfigUpdateSchema>;
    if (!isCwConfigKey(key)) {
      res.status(400).json({ error: `Unknown CW config key: ${key}` });
      return;
    }
    await setCwConfig(key, value, notes ?? null);
    res.json({ success: true });
  },
);

export default router;
