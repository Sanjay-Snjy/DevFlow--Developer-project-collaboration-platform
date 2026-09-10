import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { ISSUE_STATUSES, ISSUE_TYPES } from '../constants/index.js';
import { Issue } from '../models/Issue.js';
import { Task } from '../models/Task.js';
import { Comment } from '../models/Comment.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { nextSeq } from '../models/GithubAccount.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseBody, parseQuery } from '../utils/validate.js';
import { hasWorkspaceRole, roleAtLeast } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { recordActivity } from '../services/activityService.js';
import { notifyUser } from '../services/notifyService.js';
import { emitEvent } from '../socket.js';
import { memberSelect } from './helpers.js';

const POPULATE = [
  { path: 'assignee', select: memberSelect },
  { path: 'reporter', select: memberSelect },
];

async function ctx(projectId: string, userId: string) {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  const ws = await Workspace.findById(project.workspace);
  if (!ws) throw ApiError.notFound('Workspace not found');
  const role = hasWorkspaceRole(ws, userId);
  if (!role) throw ApiError.forbidden('You are not a member of this workspace');
  const isAdmin = ADMIN_ROLES.includes(role);
  const members = (project.members ?? []).map(String);
  if (!members.includes(userId) && !isAdmin) throw ApiError.forbidden('You are not a member of this project');
  return { role, isManager: roleAtLeast(role, 'MANAGER'), isAdmin, projectId: String(project._id), workspaceId: String(project.workspace) };
}

async function loadIssue(id: string) {
  const issue = await Issue.findById(id).populate(POPULATE);
  if (!issue) throw ApiError.notFound('Issue not found');
  return issue;
}

// ══ Collection: /api/projects/:projectId/issues ─────────────────

export const collectionRouter = Router();
collectionRouter.use(requireAuth);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20000).optional(),
  type: z.enum(ISSUE_TYPES).default('BUG'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignee: z.string().nullable().optional(),
  labels: z.array(z.string().trim().max(30)).max(20).optional(),
  environment: z.string().max(500).optional(),
  stepsToReproduce: z.string().max(5000).optional(),
  expectedResult: z.string().max(3000).optional(),
  actualResult: z.string().max(3000).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
});

const listQuery = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
  assignee: z.string().optional(),
  label: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** All issues across the projects a workspace member can see (powered the workspace Issues page). */
collectionRouter.get(
  '/workspaces/:workspaceId/issues',
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, listQuery);
    const ws = await Workspace.findById(req.params.workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    const isAdmin = ADMIN_ROLES.includes(role);
    const visible = isAdmin
      ? await Project.find({ workspace: ws._id, archivedAt: null }).select('_id key name').lean()
      : await Project.find({ workspace: ws._id, archivedAt: null, members: req.userId }).select('_id key name').lean();
    if (!visible.length) {
      ok(res, { items: [], total: 0, page: query.page, limit: query.limit });
      return;
    }
    const projectIds = visible.map((p) => p._id);
    const projectMap = new Map(visible.map((p) => [String(p._id), { id: String(p._id), key: p.key, name: p.name }]));
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = { project: { $in: projectIds } };
    if (query.status) filter.status = { $in: query.status.split(',') };
    if (query.type) filter.type = query.type;
    if (query.priority) filter.priority = query.priority;
    if (query.assignee) filter.assignee = query.assignee === 'none' ? null : query.assignee;
    if (query.label) filter.labels = query.label;
    if (query.q) {
      const rx = new RegExp(esc(query.q), 'i');
      filter.$or = [{ title: rx }, { key: rx }, { description: rx }];
    }
    const [total, items] = await Promise.all([
      Issue.countDocuments(filter),
      Issue.find(filter).sort('-createdAt').skip((query.page - 1) * query.limit).limit(query.limit).populate(POPULATE),
    ]);
    ok(res, {
      items: items.map((i: any) => ({ ...i.toJSON(), project: projectMap.get(String(i.project)) ?? { id: String(i.project), key: '?', name: '' } })),
      total,
      page: query.page,
      limit: query.limit,
    });
  })
);

collectionRouter.get(
  '/projects/:projectId/issues',
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, listQuery);
    const projectId = req.params.projectId!;
    await ctx(projectId, req.userId!);
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = { project: projectId };
    if (query.status) filter.status = { $in: query.status.split(',') };
    if (query.type) filter.type = query.type;
    if (query.priority) filter.priority = query.priority;
    if (query.assignee) filter.assignee = query.assignee === 'none' ? null : query.assignee;
    if (query.label) filter.labels = query.label;
    if (query.q) {
      const rx = new RegExp(esc(query.q), 'i');
      filter.$or = [{ title: rx }, { key: rx }, { description: rx }];
    }
    const [total, items] = await Promise.all([
      Issue.countDocuments(filter),
      Issue.find(filter).sort('-createdAt').skip((query.page - 1) * query.limit).limit(query.limit).populate(POPULATE),
    ]);
    ok(res, { items: items.map((i) => i.toJSON()), total, page: query.page, limit: query.limit });
  })
);

collectionRouter.post(
  '/projects/:projectId/issues',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createSchema);
    const c = await ctx(req.params.projectId!, req.userId!);
    const project = await Project.findById(c.projectId).select('key').lean();
    if (!project) throw ApiError.notFound('Project not found');
    if (body.assignee) {
      const ws = await Workspace.findById(c.workspaceId).select('members').lean();
      const valid = ws?.members.some((m) => String(m.user) === body.assignee);
      if (!valid) throw ApiError.badRequest('Assignee must be a member of the workspace');
    }
    const status = body.status ?? 'OPEN';
    const number = await nextSeq(c.projectId, 'issue');
    const issue = await Issue.create({
      workspace: c.workspaceId,
      project: c.projectId,
      number,
      key: `${project.key}-${number}`,
      title: body.title,
      description: body.description ?? '',
      type: body.type,
      priority: body.priority,
      severity: body.severity ?? 'MEDIUM',
      assignee: body.assignee ?? null,
      reporter: req.userId,
      labels: body.labels ?? [],
      environment: body.environment ?? '',
      stepsToReproduce: body.stepsToReproduce ?? '',
      expectedResult: body.expectedResult ?? '',
      actualResult: body.actualResult ?? '',
      status,
      resolvedAt: ['RESOLVED', 'CLOSED'].includes(status) ? new Date() : null,
    });
    const payload = (await loadIssue(String(issue._id))).toJSON();
    await recordActivity({
      workspace: c.workspaceId, project: c.projectId, actor: req.userId,
      type: 'issue.created', subjectType: 'issue', subjectId: issue._id,
      title: `Reported ${issue.key} “${issue.title}” (${issue.type})`,
    });
    if (body.assignee && String(body.assignee) !== req.userId) {
      await notifyUser({
        userId: body.assignee, actorId: req.userId, workspaceId: c.workspaceId, projectId: c.projectId,
        type: 'issue_assigned', title: `Issue ${issue.key} assigned to you`, body: issue.title,
        link: `/projects/${c.projectId}/issues/${String(issue._id)}`,
      });
    }
    emitEvent('project', c.projectId, 'issue:created', { issue: payload, actorId: req.userId });
    ok(res, payload, 201);
  })
);

// ══ Item: /api/issues ────────────────────────────────────────────

export const itemRouter = Router();
itemRouter.use(requireAuth);

itemRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const issue: any = await loadIssue(req.params.id);
    const c = await ctx(String(issue.project), req.userId!);
    const [comments, relatedTasks] = await Promise.all([
      Comment.find({ subjectType: 'issue', subjectId: issue._id }).sort('createdAt').populate('author', memberSelect),
      Task.find({ project: issue.project, labels: { $in: issue.labels ?? [] } }).select('key title status').limit(5).lean(),
    ]);
    ok(res, {
      ...issue.toJSON(),
      comments: comments.map((x) => x.toJSON()),
      relatedTasks: relatedTasks.map((t) => ({ id: String(t._id), key: t.key, title: t.title, status: t.status })),
      myRole: c.role,
    });
  })
);

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  assignee: z.string().nullable().optional(),
  labels: z.array(z.string().trim().max(30)).max(20).optional(),
  environment: z.string().max(500).optional(),
  stepsToReproduce: z.string().max(5000).optional(),
  expectedResult: z.string().max(3000).optional(),
  actualResult: z.string().max(3000).optional(),
});

itemRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, updateSchema);
    const issue: any = await loadIssue(req.params.id);
    const c = await ctx(String(issue.project), req.userId!);
    const isReporter = String(issue.reporter._id) === req.userId;
    const isAssignee = issue.assignee && String(issue.assignee._id) === req.userId;
    const fields = Object.keys(body);
    const reporterDetailFields = ['title', 'description', 'stepsToReproduce', 'expectedResult', 'actualResult', 'environment'];
    const allowedAsReporter = fields.length >= 1 && fields.every((f) => reporterDetailFields.includes(f));
    const allowedAsAssignee = fields.length === 1 && fields[0] === 'status';
    if (!c.isManager && !(isReporter && allowedAsReporter) && !(isAssignee && allowedAsAssignee)) {
      throw ApiError.forbidden('Only MANAGER+ can edit issues; the reporter may edit details and the assignee may change status');
    }
    const oldStatus = issue.status;
    for (const k of fields) {
      const v = (body as Record<string, unknown>)[k];
      issue[k] = v === null || v === undefined ? null : v;
    }
    if (['RESOLVED', 'CLOSED'].includes(issue.status) && !['RESOLVED', 'CLOSED'].includes(oldStatus)) issue.resolvedAt = new Date();
    if (issue.status === 'OPEN' && oldStatus !== 'OPEN') issue.resolvedAt = null;
    await issue.save();
    const payload = (await loadIssue(String(issue._id))).toJSON();
    await recordActivity({
      workspace: c.workspaceId, project: String(issue.project), actor: req.userId,
      type: 'issue.updated', subjectType: 'issue', subjectId: issue._id,
      title: oldStatus !== issue.status ? `Updated ${issue.key} → ${issue.status}` : `Updated ${issue.key}`,
      meta: { fields, from: oldStatus, to: issue.status },
    });
    emitEvent('project', String(issue.project), 'issue:updated', { issue: payload, actorId: req.userId });
    ok(res, payload);
  })
);

itemRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const issue: any = await loadIssue(req.params.id);
    const c = await ctx(String(issue.project), req.userId!);
    if (!c.isManager) throw ApiError.forbidden('Requires MANAGER or higher to delete issues');
    await Comment.deleteMany({ subjectType: 'issue', subjectId: issue._id });
    await Issue.deleteOne({ _id: issue._id });
    await recordActivity({
      workspace: c.workspaceId, project: String(issue.project), actor: req.userId,
      type: 'issue.deleted', title: `Deleted ${issue.key} “${issue.title}”`,
    });
    emitEvent('project', String(issue.project), 'issue:deleted', { id: String(issue._id), actorId: req.userId });
    ok(res, { ok: true });
  })
);

export default itemRouter;
