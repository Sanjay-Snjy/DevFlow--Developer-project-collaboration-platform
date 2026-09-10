import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { access, hasWorkspaceRole, roleAtLeast } from '../middleware/access.js';
import { ADMIN_ROLES, MANAGE_ROLES, PROJECT_STATUSES } from '../constants/index.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { Comment } from '../models/Comment.js';
import { Sprint } from '../models/Sprint.js';
import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';
import { recordActivity } from '../services/activityService.js';
import { notifyUser } from '../services/notifyService.js';
import { emitEvent } from '../socket.js';
import { memberSelect } from './helpers.js';

const router = Router();
router.use(requireAuth);

// ── List & create (workspace-scoped) ─────────────────────────────

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaceId = String(req.query.workspace ?? '');
    if (!workspaceId) throw ApiError.badRequest('workspace query param is required');
    const ws = await Workspace.findById(workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');

    const mine = ADMIN_ROLES.includes(role);
    const filter: Record<string, unknown> = { workspace: ws._id, archivedAt: null };
    if (!mine) filter.members = req.userId;

    const projects = await Project.find(filter).sort('-updatedAt').lean();
    const ids = projects.map((p) => String(p._id));
    const oids = ids.map((id) => new Types.ObjectId(id));
    const [taskAgg, issueAgg, memberUsers] = await Promise.all([
      Task.aggregate([
        { $match: { project: { $in: oids } } },
        { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } } } },
      ]),
      Issue.aggregate([
        { $match: { project: { $in: oids }, status: { $in: ['OPEN', 'IN_PROGRESS'] } } },
        { $group: { _id: '$project', open: { $sum: 1 } } },
      ]),
      User.find({ _id: { $in: [...new Set(projects.flatMap((p) => p.members.map((m: any) => String(m))))] } })
        .select('_id name username avatarUrl')
        .lean(),
    ]);
    const userMap = new Map<string, any>(memberUsers.map((u) => [String(u._id), u]));
    const taskMap = new Map<string, any>(taskAgg.map((t) => [String(t._id), t]));
    const issueMap = new Map<string, any>(issueAgg.map((i) => [String(i._id), i]));

    ok(
      res,
      projects.map((p: any) => {
        const agg = taskMap.get(String(p._id)) ?? { total: 0, done: 0 };
        const iss = issueMap.get(String(p._id)) ?? { open: 0 };
        const members = (p.members ?? [])
          .map((m: any) => {
            const u = userMap.get(String(m));
            return u ? { id: String(u._id), name: u.name, username: u.username, avatarUrl: u.avatarUrl ?? '' } : null;
          })
          .filter(Boolean);
        return {
          id: String(p._id),
          key: p.key,
          name: p.name,
          description: p.description,
          status: p.status,
          priority: p.priority,
          ownerId: String(p.owner),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          startDate: p.startDate,
          dueDate: p.dueDate,
          repositories: p.repositories,
          stats: { totalTasks: agg.total, doneTasks: agg.done, openIssues: iss.open, members: members.length },
          members: members.slice(0, 5),
        };
      })
    );
  })
);

const createSchema = z.object({
  workspaceId: z.string().min(1),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,5}$/, 'Key: 2-6 uppercase letters/digits, starting with a letter (e.g. DEV)'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: z.string().datetime().optional().or(z.null()),
  dueDate: z.string().datetime().optional().or(z.null()),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createSchema);
    const ws = await Workspace.findById(body.workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role || !MANAGE_ROLES.includes(role)) {
      throw ApiError.forbidden('Requires MANAGER or higher to create projects');
    }
    const dup = await Project.findOne({ workspace: ws._id, key: body.key }).select('_id').lean();
    if (dup) throw ApiError.conflict(`A project with key ${body.key} already exists`);

    const project = await Project.create({
      workspace: ws._id,
      key: body.key,
      name: body.name,
      description: body.description ?? '',
      priority: body.priority ?? 'MEDIUM',
      status: body.status ?? 'PLANNING',
      owner: req.userId,
      members: [req.userId],
      startDate: body.startDate ?? null,
      dueDate: body.dueDate ?? null,
    });
    await recordActivity({
      workspace: ws._id, actor: req.userId, type: 'project.created', subjectType: 'project', subjectId: project._id,
      title: `Created project ${body.key} “${body.name}”`,
    });
    emitEvent('workspace', String(ws._id), 'project:created', { project: { id: String(project._id), key: project.key } });
    ok(res, project.toJSON(), 201);
  })
);

// ── Detail / update / delete ─────────────────────────────────────

router.get(
  '/:id',
  ...access.projectMember(),
  asyncHandler(async (req, res) => {
    const p: any = req.projectDoc;
    const [owner, members, tasks, doneTasks, issues, sprint, workspace] = await Promise.all([
      User.findById(p.owner).select(memberSelect).lean(),
      User.find({ _id: { $in: p.members ?? [] } }).select(memberSelect).lean(),
      Task.countDocuments({ project: p._id }),
      Task.countDocuments({ project: p._id, status: 'DONE' }),
      Issue.countDocuments({ project: p._id, status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
      Sprint.findOne({ project: p._id, status: 'ACTIVE' }).select('id name endDate').lean(),
      Workspace.findById(p.workspace).select('name slug').lean(),
    ]);
    ok(res, {
      id: String(p._id),
      workspace: workspace ? { id: String(workspace._id), name: workspace.name, slug: workspace.slug } : null,
      key: p.key,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      owner: owner ? { id: String(owner._id), name: owner.name, username: owner.username, avatarUrl: owner.avatarUrl ?? '' } : null,
      members: members.map((u: any) => ({
        id: String(u._id), name: u.name, username: u.username, email: u.email,
        avatarUrl: u.avatarUrl ?? '', bio: u.bio ?? '', skills: u.skills ?? [], githubUsername: u.githubUsername ?? '',
      })),
      startDate: p.startDate,
      dueDate: p.dueDate,
      repositories: p.repositories ?? [],
      archivedAt: p.archivedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      myRole: req.workspaceRole,
      counts: { totalTasks: tasks, doneTasks: doneTasks, openIssues: issues },
      activeSprint: sprint ? { id: String(sprint._id), name: sprint.name, endDate: sprint.endDate } : null,
    });
  })
);

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,5}$/).optional(),
  owner: z.string().optional(),
  startDate: z.string().datetime().optional().or(z.null()),
  dueDate: z.string().datetime().optional().or(z.null()),
});

router.patch(
  '/:id',
  ...access.projectManage(),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, updateSchema);
    const p: any = req.projectDoc;
    const canArchive = ADMIN_ROLES.includes(req.workspaceRole!) || String(p.owner) === req.userId;
    if (body.status === 'ARCHIVED' && !canArchive) {
      throw ApiError.forbidden('Archiving a project requires ADMIN or the project owner');
    }
    if (body.key && body.key !== p.key && !ADMIN_ROLES.includes(req.workspaceRole!)) {
      throw ApiError.forbidden('Changing the project key requires an ADMIN');
    }
    const keyChanged = body.key && body.key !== p.key;
    const statusChanged = body.status && body.status !== p.status;

    if (keyChanged) {
      const dup = await Project.findOne({ workspace: p.workspace, key: body.key, _id: { $ne: p._id } }).select('_id').lean();
      if (dup) throw ApiError.conflict(`A project with key ${body.key} already exists`);
    }

    if (body.owner && body.owner !== String(p.owner)) {
      const ws: any = await Workspace.findById(p.workspace).select('members').lean();
      const isMember = (ws?.members ?? []).some((m: any) => String(m.user) === body.owner);
      if (!isMember) throw ApiError.badRequest('New owner must be a member of this workspace');
    }

    Object.assign(p, body);
    if (p.status === 'ARCHIVED') p.archivedAt = p.archivedAt ?? new Date();
    if (p.status !== 'ARCHIVED' && p.archivedAt && statusChanged) p.archivedAt = null;

    if (keyChanged) {
      await Promise.all([
        Task.updateMany({ project: p._id }, [{
          $set: { key: { $concat: [body.key!, '-', { $toString: '$number' }] } },
        }]),
        Issue.updateMany({ project: p._id }, [{
          $set: { key: { $concat: [body.key!, '-', { $toString: '$number' }] } },
        }]),
      ]);
    }
    await p.save();

    await recordActivity({
      workspace: p.workspace, project: p._id, actor: req.userId, type: statusChanged && p.status === 'ARCHIVED' ? 'project.archived' : 'project.updated',
      subjectType: 'project', subjectId: p._id, title: `Updated project ${p.key}`, meta: { changes: body },
    });
    emitEvent('workspace', String(p.workspace), 'project:updated', { id: String(p._id) });
    ok(res, p.toJSON());
  })
);

router.delete(
  '/:id',
  ...access.projectMember(),
  asyncHandler(async (req, res) => {
    const p: any = req.projectDoc;
    const isOwner = String(p.owner) === req.userId;
    if (!ADMIN_ROLES.includes(req.workspaceRole!) && !isOwner) {
      throw ApiError.forbidden('Only ADMINs and the project owner can delete a project');
    }
    const taskIds = await Task.find({ project: p._id }).select('_id').lean();
    const ids = taskIds.map((t) => t._id);
    await Promise.all([
      Comment.deleteMany({ project: p._id }),
      Sprint.deleteMany({ project: p._id }),
      Task.deleteMany({ project: p._id }),
      Issue.deleteMany({ project: p._id }),
      Activity.deleteMany({ project: p._id }),
    ]);
    void ids;
    await Project.deleteOne({ _id: p._id });
    await recordActivity({
      workspace: p.workspace, actor: req.userId, type: 'project.archived', title: `Deleted project ${p.key} “${p.name}”`,
    });
    emitEvent('workspace', String(p.workspace), 'project:deleted', { id: String(p._id) });
    ok(res, { ok: true });
  })
);

// ── Members ──────────────────────────────────────────────────────

router.get(
  '/:id/members',
  ...access.projectMember(),
  asyncHandler(async (req, res) => {
    const p: any = req.projectDoc;
    const members = await User.find({ _id: { $in: p.members ?? [] } }).select(memberSelect).lean();
    const openByMember = await Task.aggregate([
      { $match: { project: p._id, assignee: { $ne: null }, status: { $ne: 'DONE' } } },
      { $group: { _id: '$assignee', open: { $sum: 1 } } },
    ]);
    const doneByMember = await Task.aggregate([
      { $match: { project: p._id, assignee: { $ne: null }, status: 'DONE' } },
      { $group: { _id: '$assignee', done: { $sum: 1 } } },
    ]);
    const openMap = new Map(openByMember.map((r) => [String(r._id), r.open]));
    const doneMap = new Map(doneByMember.map((r) => [String(r._id), r.done]));
    ok(res, {
      members: members.map((u: any) => ({
        id: String(u._id), name: u.name, username: u.username, email: u.email,
        avatarUrl: u.avatarUrl ?? '', skills: u.skills ?? [], githubUsername: u.githubUsername ?? '',
        openTasks: openMap.get(String(u._id)) ?? 0, doneTasks: doneMap.get(String(u._id)) ?? 0,
      })),
      workspaceMembers: await Workspace.findById(p.workspace).select('members').lean().then((ws: any) =>
        (ws?.members ?? []).map((m: any) => ({ userId: String(m.user), role: m.role, joinedAt: m.joinedAt }))
      ),
      projectMemberIds: (p.members ?? []).map(String),
      myRole: req.workspaceRole,
    });
  })
);

const addMembersSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(50) });

router.post(
  '/:id/members',
  ...access.projectManage(),
  asyncHandler(async (req, res) => {
    const { userIds } = parseBody(req, addMembersSchema);
    const p: any = req.projectDoc;
    const ws: any = await Workspace.findById(p.workspace).select('name members').lean();
    if (!ws) throw ApiError.notFound('Workspace not found');
    const wsMemberIds = new Set((ws.members ?? []).map((m: any) => String(m.user)));
    const allValid = userIds.every((uid) => wsMemberIds.has(uid));
    if (!allValid) throw ApiError.badRequest('Some users are not members of this workspace');
    const added: any[] = [];
    for (const uid of userIds) {
      if (!p.members.some((m: any) => String(m) === uid)) {
        p.members.push(uid);
        added.push(uid);
      }
    }
    await p.save();
    const addedUsers = await User.find({ _id: { $in: added } }).select('_id name').lean();
    for (const u of addedUsers) {
      await notifyUser({
        userId: u._id, actorId: req.userId, workspaceId: p.workspace, projectId: p._id,
        type: 'project_added', title: `You were added to ${p.name}`, link: `/projects/${String(p._id)}`,
      });
    }
    if (added.length) {
      await recordActivity({
        workspace: p.workspace, project: p._id, actor: req.userId, type: 'project.updated',
        title: `Added ${addedUsers.length} member${addedUsers.length > 1 ? 's' : ''} to ${p.key}`,
      });
    }
    emitEvent('workspace', String(p.workspace), 'project:updated', { id: String(p._id) });
    ok(res, { ok: true, added: added.length });
  })
);

router.delete(
  '/:id/members/:userId',
  ...access.projectMember(),
  asyncHandler(async (req, res) => {
    const p: any = req.projectDoc;
    const target = req.params.userId;
    if (!roleAtLeast(req.workspaceRole!, 'MANAGER') && req.userId !== target) {
      throw ApiError.forbidden('Only managers can remove other project members');
    }
    if (String(p.owner) === target && req.userId !== target) {
      throw ApiError.badRequest('The project owner cannot be removed');
    }
    p.members = (p.members ?? []).filter((m: any) => String(m) !== target);
    await p.save();
    await Task.updateMany({ project: p._id, assignee: target }, { $set: { assignee: null } });
    await Issue.updateMany({ project: p._id, assignee: target }, { $set: { assignee: null } });
    emitEvent('workspace', String(p.workspace), 'project:updated', { id: String(p._id) });
    ok(res, { ok: true });
  })
);

// ── Linked GitHub repositories ───────────────────────────────────

const repoSchema = z.object({
  fullName: z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Use owner/repository format'),
  defaultBranch: z.string().trim().max(100).optional(),
});

router.post(
  '/:id/github-repos',
  ...access.projectManage(),
  asyncHandler(async (req, res) => {
    const { fullName, defaultBranch } = parseBody(req, repoSchema);
    const p: any = req.projectDoc;
    const [owner, name] = fullName.split('/');
    if ((p.repositories ?? []).some((r: any) => r.fullName.toLowerCase() === fullName.toLowerCase())) {
      throw ApiError.conflict('This repository is already linked to the project');
    }
    p.repositories.push({
      fullName, owner, name, defaultBranch: defaultBranch ?? 'main', linkedBy: req.userId, linkedAt: new Date(),
    });
    await p.save();
    await recordActivity({
      workspace: p.workspace, project: p._id, actor: req.userId, type: 'github.linked',
      title: `Linked GitHub repository ${fullName}`, meta: { repo: fullName },
    });
    emitEvent('workspace', String(p.workspace), 'project:updated', { id: String(p._id) });
    ok(res, p.toJSON(), 201);
  })
);

router.delete(
  '/:id/github-repos',
  ...access.projectManage(),
  asyncHandler(async (req, res) => {
    const fullName = (parseBody(req, z.object({ fullName: z.string().min(1) }))).fullName.toLowerCase();
    const p: any = req.projectDoc;
    const before = p.repositories.length;
    p.repositories = (p.repositories ?? []).filter((r: any) => r.fullName.toLowerCase() !== fullName);
    if (p.repositories.length === before) throw ApiError.notFound('Repository not linked');
    await p.save();
    await recordActivity({
      workspace: p.workspace, project: p._id, actor: req.userId, type: 'github.unlinked',
      title: `Unlinked GitHub repository ${fullName}`,
    });
    emitEvent('workspace', String(p.workspace), 'project:updated', { id: String(p._id) });
    ok(res, { ok: true });
  })
);

export default router;
