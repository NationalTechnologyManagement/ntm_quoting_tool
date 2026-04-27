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

const router = Router();

// Get integration status
router.get('/api/admin/settings/integrations', requireAuth, async (_req, res) => {
  res.json({
    ap: {
      configured: !!(env.AP_CLIENT_ID && env.AP_CLIENT_SECRET),
      hasWebhookSecret: !!env.AP_WEBHOOK_SECRET,
    },
    cw: {
      configured: !!(env.CW_COMPANY_ID && env.CW_PUBLIC_KEY && env.CW_PRIVATE_KEY && env.CW_CLIENT_ID),
      companyId: env.CW_COMPANY_ID || null,
      baseUrl: env.CW_BASE_URL,
    },
    ghl: {
      configured: !!env.GHL_API_KEY,
      locationId: env.GHL_LOCATION_ID || null,
    },
    email: {
      configured: !!env.RESEND_API_KEY,
      fromEmail: env.FROM_EMAIL,
    },
  });
});

// Test GHL connection
router.post('/api/admin/settings/integrations/ghl/test', requireAuth, async (_req, res) => {
  if (!env.GHL_API_KEY) {
    res.json({ success: false, error: 'GHL API key not configured' });
    return;
  }

  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${env.GHL_LOCATION_ID}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${env.GHL_API_KEY}`,
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
  if (!env.CW_COMPANY_ID || !env.CW_PUBLIC_KEY || !env.CW_PRIVATE_KEY || !env.CW_CLIENT_ID) {
    res.json({ success: false, error: 'ConnectWise credentials not fully configured' });
    return;
  }

  try {
    const credentials = Buffer.from(
      `${env.CW_COMPANY_ID}+${env.CW_PUBLIC_KEY}:${env.CW_PRIVATE_KEY}`,
    ).toString('base64');

    const response = await fetch(`${env.CW_BASE_URL}/system/info`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        clientId: env.CW_CLIENT_ID,
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
  if (!env.RESEND_API_KEY) {
    res.json({ success: false, error: 'Resend API key not configured' });
    return;
  }

  try {
    // Send-only keys can't list domains or API keys, so just validate by checking the key format
    // and attempting a dry-run style check
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      // Send with invalid "to" to validate the key without actually sending
      body: JSON.stringify({ from: env.FROM_EMAIL, to: 'test@validation.check', subject: 'test', html: 'test' }),
    });

    if (response.ok) {
      // Unlikely but key works and email was sent
      res.json({ success: true, message: `Connected to Resend. Sending from: ${env.FROM_EMAIL}` });
    } else {
      const data = await response.json().catch(() => ({}));
      // 401 = bad key, 403 = domain not verified, 422 = validation error (key is valid!)
      if (response.status === 422 || response.status === 403) {
        const domainIssue = response.status === 403 || data.message?.includes('verify');
        res.json({
          success: !domainIssue,
          message: domainIssue
            ? `Resend key valid but sending domain not verified. Verify ${env.FROM_EMAIL.split('@')[1]} at resend.com/domains`
            : `Connected to Resend. Sending from: ${env.FROM_EMAIL}`,
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
  if (!env.AP_CLIENT_ID || !env.AP_CLIENT_SECRET) {
    res.json({ success: false, error: 'Alternative Payments credentials not configured' });
    return;
  }

  try {
    const credentials = Buffer.from(`${env.AP_CLIENT_ID}:${env.AP_CLIENT_SECRET}`).toString('base64');
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
