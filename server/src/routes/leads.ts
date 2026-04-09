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

export default router;
