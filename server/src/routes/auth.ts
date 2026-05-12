import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';
import * as inviteService from '../services/invite.service.js';
import * as userService from '../services/user.service.js';

const router = Router();

// ── Login (step 1: password) ────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/api/admin/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.json(result);
});

// ── Login (step 2: verify the second factor) ───────────────────────
const verifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(1),
});

router.post('/api/admin/login/verify', validate(verifySchema), async (req, res) => {
  const { challengeToken, code } = req.body as z.infer<typeof verifySchema>;
  const result = await authService.verifyTwoFactor(challengeToken, code);
  res.json(result);
});

const resendCodeSchema = z.object({ challengeToken: z.string().min(1) });
router.post('/api/admin/login/resend-code', validate(resendCodeSchema), async (req, res) => {
  await authService.resendEmailCode(req.body.challengeToken);
  res.json({ success: true });
});

// ── 2FA setup (called after invite acceptance OR forced first login) ──
const setupStartSchema = z.object({
  setupToken: z.string().min(1),
  method: z.enum(['totp', 'email']),
});

router.post('/api/admin/2fa/setup/start', validate(setupStartSchema), async (req, res) => {
  const { setupToken, method } = req.body as z.infer<typeof setupStartSchema>;
  const result = await authService.start2faSetup(setupToken, method);
  res.json(result);
});

const setupConfirmSchema = z.object({
  setupToken: z.string().min(1),
  method: z.enum(['totp', 'email']),
  code: z.string().min(1),
});

router.post('/api/admin/2fa/setup/confirm', validate(setupConfirmSchema), async (req, res) => {
  const { setupToken, method, code } = req.body as z.infer<typeof setupConfirmSchema>;
  const result = await authService.confirm2faSetup(setupToken, method, code);
  res.json(result);
});

// ── Authenticated profile ───────────────────────────────────────────
router.get('/api/admin/me', requireAuth, async (req, res) => {
  res.json({ user: req.admin });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post(
  '/api/admin/change-password',
  requireAuth,
  validate(changePasswordSchema),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    if (!req.admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await authService.changePassword(req.admin.userId, currentPassword, newPassword);
    res.json({ success: true });
  },
);

// ── Invite acceptance (no auth — token is the credential) ──────────
router.get('/api/admin/invites/:token', async (req, res) => {
  const invite = await inviteService.getInviteByToken(req.params.token as string);
  res.json({
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
});

const acceptInviteSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

router.post(
  '/api/admin/invites/:token/accept',
  validate(acceptInviteSchema),
  async (req, res) => {
    const { name, password } = req.body as z.infer<typeof acceptInviteSchema>;
    const result = await inviteService.acceptInvite({
      token: req.params.token as string,
      name,
      password,
    });
    res.json(result);
  },
);

// ── Admin-only user management ─────────────────────────────────────
router.get('/api/admin/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const users = await userService.listUsers();
  res.json({ users });
});

// Sales reps picker — any authenticated admin/rep can read this list so
// they can assign a rep to a quote and CC them on the email.
router.get('/api/admin/sales-reps', requireAuth, async (_req, res) => {
  const reps = await userService.listSalesReps();
  res.json({ reps });
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'sales_rep']),
});

router.post(
  '/api/admin/users/invite',
  requireAuth,
  requireRole('admin'),
  validate(inviteSchema),
  async (req, res) => {
    if (!req.admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const result = await inviteService.createInvite({
      email: req.body.email,
      role: req.body.role,
      invitedById: req.admin.userId,
      inviterName: req.admin.email,
    });
    res.status(201).json({
      inviteId: result.inviteId,
      expiresAt: result.expiresAt,
    });
  },
);

router.get('/api/admin/invites', requireAuth, requireRole('admin'), async (_req, res) => {
  const invites = await inviteService.listInvites();
  res.json({ invites });
});

router.delete(
  '/api/admin/invites/:id',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    await inviteService.revokeInvite(req.params.id as string);
    res.json({ success: true });
  },
);

const setActiveSchema = z.object({ active: z.boolean() });
router.patch(
  '/api/admin/users/:id/active',
  requireAuth,
  requireRole('admin'),
  validate(setActiveSchema),
  async (req, res) => {
    await userService.setUserActive(req.params.id as string, req.body.active);
    res.json({ success: true });
  },
);

const setRoleSchema = z.object({ role: z.enum(['admin', 'sales_rep']) });
router.patch(
  '/api/admin/users/:id/role',
  requireAuth,
  requireRole('admin'),
  validate(setRoleSchema),
  async (req, res) => {
    await userService.setUserRole(req.params.id as string, req.body.role);
    res.json({ success: true });
  },
);

router.post(
  '/api/admin/users/:id/reset-2fa',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    await authService.resetUserTwoFactor(req.params.id as string);
    res.json({ success: true });
  },
);

router.delete(
  '/api/admin/users/:id',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    if (!req.admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await userService.deleteUser(req.params.id as string, req.admin.userId);
    res.json({ success: true });
  },
);

export default router;
