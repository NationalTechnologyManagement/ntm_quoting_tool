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
