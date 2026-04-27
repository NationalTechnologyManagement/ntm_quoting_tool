import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/api/admin/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.json(result);
});

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

export default router;
