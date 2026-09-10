import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const [items, total, unread] = await Promise.all([
      Notification.find({ user: req.userId })
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actor', 'name username avatarUrl')
        .populate('workspace', 'name')
        .lean(),
      Notification.countDocuments({ user: req.userId }),
      Notification.countDocuments({ user: req.userId, readAt: null }),
    ]);
    ok(res, {
      items: items.map((n: any) => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt,
        createdAt: n.createdAt,
        actor: n.actor ? { id: String(n.actor._id), name: n.actor.name, username: n.actor.username, avatarUrl: n.actor.avatarUrl ?? '' } : null,
        workspace: n.workspace ? { id: String(n.workspace._id), name: n.workspace.name } : null,
      })),
      total,
      unread,
      page,
      limit,
    });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await Notification.countDocuments({ user: req.userId, readAt: null });
    ok(res, { unread });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.userId, readAt: null }, { $set: { readAt: new Date() } });
    ok(res, { ok: true });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.userId, readAt: null },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!n) {
      const exists = await Notification.exists({ _id: req.params.id, user: req.userId });
      if (!exists) throw ApiError.notFound('Notification not found');
      ok(res, { ok: true });
      return;
    }
    ok(res, { ok: true });
  })
);

export default router;
