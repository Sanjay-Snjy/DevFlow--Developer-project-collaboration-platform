import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Workspace } from '../models/Workspace.js';
import { Invitation } from '../models/Invitation.js';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { maskEmail, sha256 } from '../utils/auth.js';
import { parseBody } from '../utils/validate.js';
import { recordActivity } from '../services/activityService.js';
import { emitEvent } from '../socket.js';

const router = Router();
router.use(requireAuth);

/** Pending invitations for the signed-in user's email. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = await User.findById(req.userId).select('email').lean();
    if (!me) throw ApiError.notFound('User not found');
    const pending = await Invitation.find({ email: me.email, status: 'PENDING' })
      .sort('-createdAt')
      .limit(30)
      .populate('workspace', 'name slug logoUrl')
      .lean();
    ok(
      res,
      pending.map((i: any) => ({
        id: String(i._id),
        workspace: i.workspace
          ? { id: String(i.workspace._id), name: i.workspace.name, slug: i.workspace.slug, logoUrl: i.workspace.logoUrl ?? '' }
          : null,
        role: i.role,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      }))
    );
  })
);

/** Accept an invitation via its shareable token. The signed-in account's email must match. */
router.post(
  '/accept',
  asyncHandler(async (req, res) => {
    const token = parseBody(req, z.object({ token: z.string().min(10) })).token;
    const invite = await Invitation.findOne({ tokenHash: sha256(token) });
    if (!invite) throw ApiError.notFound('Invitation not found or already used');
    if (invite.status !== 'PENDING') throw ApiError.badRequest('This invitation is no longer pending');
    if (invite.expiresAt < new Date()) {
      invite.status = 'EXPIRED';
      await invite.save();
      throw ApiError.badRequest('This invitation has expired');
    }
    const me = await User.findById(req.userId).select('_id email name').lean();
    if (!me) throw ApiError.unauthorized('Sign in to accept this invitation');
    if (me.email !== invite.email) {
      throw ApiError.forbidden(`This invitation was sent to ${maskEmail(invite.email)} — sign in with that account`);
    }
    const ws = await Workspace.findById(invite.workspace);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const existing = ws.members.find((m: any) => String(m.user) === String(me._id));
    if (!existing) {
      ws.members.push({ user: me._id, role: invite.role, joinedAt: new Date() });
      await ws.save();
      // Grant project access so the new member can see the workspace content immediately.
      await Project.updateMany({ workspace: ws._id }, { $addToSet: { members: me._id } });
    }
    invite.status = 'ACCEPTED';
    await invite.save();
    await recordActivity({ workspace: ws._id, actor: me._id, type: 'member.joined', title: `${me.name} joined the workspace` });
    emitEvent('workspace', String(ws._id), 'workspace:changed', { id: String(ws._id) });
    ok(res, { ok: true, workspaceId: String(ws._id), role: invite.role });
  })
);

router.post(
  '/:inviteId/decline',
  asyncHandler(async (req, res) => {
    const me = await User.findById(req.userId).select('email').lean();
    const invite = await Invitation.findById(req.params.inviteId);
    if (!me || !invite) throw ApiError.notFound('Invitation not found');
    if (invite.email !== me.email) throw ApiError.forbidden('This invitation belongs to another account');
    if (invite.status === 'PENDING') {
      invite.status = 'DECLINED';
      await invite.save();
    }
    ok(res, { ok: true });
  })
);

export default router;
