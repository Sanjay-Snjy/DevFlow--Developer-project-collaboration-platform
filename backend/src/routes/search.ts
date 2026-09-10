import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Workspace } from '../models/Workspace.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { Comment } from '../models/Comment.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseQuery } from '../utils/validate.js';
import { hasWorkspaceRole } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';

const router = Router();
router.use(requireAuth);

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(['all', 'tasks', 'issues', 'projects', 'members', 'comments']).default('all'),
});

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
  '/workspaces/:workspaceId/search',
  asyncHandler(async (req, res) => {
    const { q, type } = parseQuery(req, searchQuery);
    const ws = await Workspace.findById(req.params.workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    const isAdmin = ADMIN_ROLES.includes(role);

    const visibleProjects = isAdmin
      ? await Project.find({ workspace: ws._id }).select('_id key name').lean()
      : await Project.find({ workspace: ws._id, members: req.userId }).select('_id key name').lean();
    const projectIds = visibleProjects.map((p) => p._id);
    const rx = { $regex: esc(q), $options: 'i' };
    const sections: Array<{ type: string; label: string; items: any[] }> = [];

    const push = (t: string, label: string, items: any[]) => {
      if (items.length) sections.push({ type: t, label, items });
    };

    const limit = 6;
    const want = (t: string) => type === 'all' || type === t;

    if (want('projects')) {
      const projects = await Project.find({
        workspace: ws._id,
        archivedAt: null,
        $or: [{ name: rx }, { key: rx }, { description: rx }],
        ...(isAdmin ? {} : { members: req.userId }),
      }).select('id key name status').limit(limit).lean();
      push('projects', 'Projects', projects.map((p: any) => ({ id: String(p._id), key: p.key, name: p.name, status: p.status })));
    }

    if (want('tasks')) {
      const tasks = await Task.find({ workspace: ws._id, project: { $in: projectIds }, $or: [{ title: rx }, { key: rx }, { description: rx }] })
        .select('key title status priority project').sort('-updatedAt').limit(limit).populate('project', 'key name').lean();
      push('tasks', 'Tasks', tasks.map((t: any) => ({
        id: String(t._id), key: t.key, title: t.title, status: t.status, priority: t.priority,
        project: t.project ? { id: String(t.project._id), key: t.project.key, name: t.project.name } : null,
      })));
    }

    if (want('issues')) {
      const issues = await Issue.find({ workspace: ws._id, project: { $in: projectIds }, $or: [{ title: rx }, { key: rx }, { description: rx }] })
        .select('key title status type project').sort('-updatedAt').limit(limit).populate('project', 'key name').lean();
      push('issues', 'Issues', issues.map((i: any) => ({
        id: String(i._id), key: i.key, title: i.title, status: i.status, type: i.type,
        project: i.project ? { id: String(i.project._id), key: i.project.key, name: i.project.name } : null,
      })));
    }

    if (want('members')) {
      const memberIds = ws.members.map((m: any) => String(m.user));
      const members = await User.find({ _id: { $in: memberIds }, $or: [{ name: rx }, { username: rx }] })
        .select('name username avatarUrl').limit(limit).lean();
      push('members', 'People', members.map((u: any) => {
        const entry = ws.members.find((m: any) => String(m.user) === String(u._id));
        return { id: String(u._id), name: u.name, username: u.username, avatarUrl: u.avatarUrl ?? '', role: entry?.role ?? 'VIEWER' };
      }));
    }

    if (want('comments')) {
      const comments = await Comment.find({ workspace: ws._id, project: { $in: projectIds }, content: rx })
        .select('content subjectType subjectId project').sort('-createdAt').limit(limit).populate('project', 'key name').lean();
      push('comments', 'Comments', comments.map((c: any) => ({
        id: String(c._id), content: c.content.slice(0, 160), subjectType: c.subjectType, subjectId: String(c.subjectId),
        project: c.project ? { id: String(c.project._id), key: c.project.key, name: c.project.name } : null,
      })));
    }

    ok(res, { query: q, sections });
  })
);

export default router;
