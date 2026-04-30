import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as crmService from '../services/crm.service.js';

const router = Router();

const leadSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
    businessName: z.string(),
    address: z.string(),
    userCount: z.number(),
    locationCount: z.number(),
    referrerCode: z.string().optional(),
  }),
  selectedPackage: z.any().nullable(),
  selectedAddons: z.array(z.any()),
  timestamp: z.string(),
  source: z.string(),
});

router.post('/api/leads', validate(leadSchema), async (req, res) => {
  // Fire-and-forget — don't block the user flow
  crmService.createLead(req.body).catch((err) => {
    console.error('[Lead] CRM creation failed:', err);
  });

  res.json({ success: true });
});

// Lite quoting tool: lazy lead capture. Fires from the customer info form
// every time it changes (debounced client-side). Upserts a GHL contact and
// applies the `quote-tool-lite-lead` tag. No quote is created — the customer
// hasn't clicked anything yet.
const captureSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().default(''),
    businessName: z.string().default(''),
    address: z.string().default(''),
    userCount: z.number().int().min(0).default(0),
    locationCount: z.number().int().min(0).default(0),
    referrerCode: z.string().nullable().optional(),
  }),
});

router.post('/api/leads/capture', validate(captureSchema), async (req, res) => {
  // Fire-and-forget — never block keystrokes on a slow GHL call
  crmService
    .captureLiteLead(req.body.customer)
    .catch((err) => console.error('[Lead] Lite capture failed:', err));
  res.json({ success: true });
});

export default router;
