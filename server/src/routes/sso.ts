// GHL embed SSO endpoints. See sso.service.ts for the full flow narrative.

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import {
  validateGhlEntry,
  readCookie,
  sessionFromDeviceCookie,
  issueEnrollmentCode,
  enrollDevice,
  logoutDevice,
  DEVICE_COOKIE_NAME,
} from '../services/sso.service.js';

const router = Router();

const entrySchema = z.object({
  loc: z.string().min(1),
  k: z.string().min(1),
});

// Probe: do we already trust this device? Frontend calls this on /sso/ghl
// load. If we return { ready: true }, frontend immediately redirects into
// the admin portal — no prompt.
router.post('/api/sso/ghl/check', validate(entrySchema), async (req, res) => {
  validateGhlEntry(req.body.loc, req.body.k);

  const deviceCookie = readCookie(req.headers.cookie, DEVICE_COOKIE_NAME);
  const result = await sessionFromDeviceCookie(deviceCookie);
  if (!result) {
    res.json({ ready: false });
    return;
  }
  res.setHeader('Set-Cookie', result.setCookies);
  res.json({ ready: true, token: result.token, user: result.user });
});

// Start enrollment: emails a 6-digit code to the user. Always responds 200
// even when the email isn't a known admin, to keep the endpoint from doubling
// as an account-existence oracle.
const startSchema = z.object({
  loc: z.string().min(1),
  k: z.string().min(1),
  email: z.string().email(),
});
router.post('/api/sso/ghl/start', validate(startSchema), async (req, res) => {
  validateGhlEntry(req.body.loc, req.body.k);
  await issueEnrollmentCode(req.body.email);
  res.json({ success: true });
});

// Verify the code + mint the device + scoped session cookies.
const verifySchema = z.object({
  loc: z.string().min(1),
  k: z.string().min(1),
  email: z.string().email(),
  code: z.string().min(1),
});
router.post('/api/sso/ghl/verify', validate(verifySchema), async (req, res) => {
  validateGhlEntry(req.body.loc, req.body.k);
  const result = await enrollDevice({
    email: req.body.email,
    code: req.body.code,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
  res.setHeader('Set-Cookie', result.setCookies);
  res.json({ success: true, token: result.token, user: result.user });
});

// Revoke the current device + session. We don't gate this on validateGhlEntry
// so a user can log out from anywhere (e.g. a "Sign out of this device"
// button inside the admin portal).
router.post('/api/sso/ghl/logout', async (req, res) => {
  const deviceCookie = readCookie(req.headers.cookie, DEVICE_COOKIE_NAME);
  const clearCookies = await logoutDevice(deviceCookie);
  res.setHeader('Set-Cookie', clearCookies);
  res.json({ success: true });
});

export default router;
