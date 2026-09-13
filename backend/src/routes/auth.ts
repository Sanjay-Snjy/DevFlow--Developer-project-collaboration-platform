import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ok } from '../utils/errors.js';
import { buildAuthData } from './helpers.js';
import { provisionUserWorkspace } from '../utils/clerkAuth.js';

const router = Router();

/** Current user + workspaces. Provisions a personal workspace on first visit. */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  // First call after provisioning a brand-new user: give them a personal workspace.
  if (!(await hasWorkspace(req.userId!))) {
    const me = await buildAuthData(req.userId!);
    await provisionUserWorkspace(req.userId!, me.user.name, me.user.username);
  }
  ok(res, await buildAuthData(req.userId!));
}));

export default router;

async function hasWorkspace(userId: string): Promise<boolean> {
  const { Workspace } = await import('../models/Workspace.js');
  return Boolean(await Workspace.findOne({ 'members.user': userId }).select('_id').lean());
}
