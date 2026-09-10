import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { hashPassword, setAuthCookie, signToken, verifyPassword } from '../utils/auth.js';
import { parseBody } from '../utils/validate.js';
import { buildAuthData } from './helpers.js';

const router = Router();
router.use(requireAuth);

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(600).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).optional(),
  githubUsername: z.string().trim().max(40).optional(),
  avatarUrl: z.string().url().max(1000).optional().or(z.literal('')),
  notificationPrefs: z
    .object({
      taskAssigned: z.boolean().optional(),
      mentions: z.boolean().optional(),
      comments: z.boolean().optional(),
      projectActivity: z.boolean().optional(),
      githubActivity: z.boolean().optional(),
      aiNotifications: z.boolean().optional(),
    })
    .optional(),
});

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, updateSchema);
    const user = await User.findById(req.userId);
    if (!user) throw ApiError.notFound('User not found');
    Object.assign(user, body);
    await user.save();
    ok(res, (await buildAuthData(req.userId!)).user);
  })
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

router.post(
  '/password',
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(req, passwordSchema);
    const user = await User.findById(req.userId).select('+passwordHash +tokenVersion');
    if (!user) throw ApiError.notFound('User not found');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is incorrect');
    }
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    // Re-issue cookie with the updated tokenVersion for the active session
    const token = signToken(String(user._id), user.tokenVersion);
    setAuthCookie(res, token);
    ok(res, { ok: true });
  })
);

export default router;
