import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
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

export default router;
