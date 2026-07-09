import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { searchCompanies, getCompanyAgreements } from '../services/connectwise.service.js';

const router = Router();

// Search CW companies by name. Backs the "existing customer" picker on the
// admin Create Quote page so provisioning targets the exact company record
// instead of relying on an exact-name match. Read-only GET — safe in
// CW_DRY_RUN mode too.
router.get('/api/admin/cw/companies', requireAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }
  try {
    const companies = await searchCompanies(q);
    res.json({ companies });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? 'CW search failed' });
  }
});

// Active agreements on a CW company. Lets the admin pin exactly which
// agreement an existing customer's additions land on.
router.get('/api/admin/cw/companies/:companyId/agreements', requireAuth, async (req, res) => {
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    res.status(400).json({ error: 'Invalid company id' });
    return;
  }
  try {
    const agreements = await getCompanyAgreements(companyId);
    res.json({ agreements });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? 'CW agreement lookup failed' });
  }
});

export default router;
