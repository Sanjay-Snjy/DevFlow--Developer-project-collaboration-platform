import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import { Workspace } from '../models/Workspace.js';
import { Project } from '../models/Project.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseQuery } from '../utils/validate.js';
import { hasWorkspaceRole } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';

const router = Router();
router.use(requireAuth);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
});

async function loadFeed(filter: Record<string, unknown>, query: { page: number; limit: number }, totalQ: Record<string, unknown>) {
  const [items, total] = await Promise.all([
    Activity.find(filter)
      .sort('-createdAt')
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('actor', 'name username avatarUrl')
      .populate('project', 'key name')
      .lean(),
    Activity.countDocuments(totalQ),
  ]);
  return {
    items: items.map((a: any) => ({
      id: String(a._id),
      type: a.type,
      title: a.title,
      createdAt: a.createdAt,
      meta: a.meta ?? {},
      actor: a.actor ? { id: String(a.actor._id), name: a.actor.name, username: a.actor.username, avatarUrl: a.actor.avatarUrl ?? '' } : null,
      project: a.project ? { id: String(a.project._id), key: a.project.key, name: a.project.name } : null,
    })),
    total,
    page: query.page,
    limit: query.limit,
  };
}

router.get(
  '/workspaces/:workspaceId/activity',
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, listQuery);
    const ws = await Workspace.findById(req.params.workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    const filter: Record<string, unknown> = { workspace: ws._id };
    if (query.type) filter.type = query.type;
    ok(res, await loadFeed(filter, query, filter));
  })
);

router.get(
  '/projects/:projectId/activity',
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, listQuery);
    const project = await Project.findById(req.params.projectId);
    if (!project) throw ApiError.notFound('Project not found');
    const ws = await Workspace.findById(project.workspace).select('members').lean();
    const role = ws ? hasWorkspaceRole(ws as never, req.userId!) : null;
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    const isAdmin = role && ADMIN_ROLES.includes(role);
    const members = (project.members ?? []).map(String);
    if (!members.includes(req.userId!) && !isAdmin) throw ApiError.forbidden('You are not a member of this project');
    const filter: Record<string, unknown> = { project: project._id };
    if (query.type) filter.type = query.type;
    ok(res, await loadFeed(filter, query, filter));
  })
);

export default router;
