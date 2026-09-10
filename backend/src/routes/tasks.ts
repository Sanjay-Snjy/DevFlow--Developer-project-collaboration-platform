import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { ADMIN_ROLES, TASK_STATUSES, type WorkspaceRole } from '../constants/index.js';
import { Task } from '../models/Task.js';
import { Comment } from '../models/Comment.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { Sprint } from '../models/Sprint.js';
import { nextSeq } from '../models/GithubAccount.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseBody, parseQuery } from '../utils/validate.js';
import { hasWorkspaceRole, roleAtLeast } from '../middleware/access.js';
import { recordActivity } from '../services/activityService.js';
import { notifyUser } from '../services/notifyService.js';
import { emitEvent } from '../socket.js';
import { memberSelect } from './helpers.js';

const POPULATE = [
  { path: 'assignee', select: memberSelect },
  { path: 'reporter', select: memberSelect },
];

type Ctx = { role: WorkspaceRole; isAdmin: boolean; isManager: boolean; projectId: string; workspaceId: string };

/** Authorizes a workspace/project for task scoped operations (routes carry the project id). */
async function projectCtx(projectId: string, userId: string): Promise<Ctx> {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  const ws = await Workspace.findById(project.workspace);
  if (!ws) throw ApiError.notFound('Workspace not found');
  const role = hasWorkspaceRole(ws, userId);
  if (!role) throw ApiError.forbidden('You are not a member of this workspace');
  const isAdmin = ADMIN_ROLES.includes(role);
  const memberIds = (project.members ?? []).map(String);
  if (!memberIds.includes(userId) && !isAdmin) throw ApiError.forbidden('You are not a member of this project');
  return { role, isAdmin, isManager: roleAtLeast(role, 'MANAGER'), projectId: String(project._id), workspaceId: String(project.workspace) };
}

async function loadTask(taskId: string) {
  const task = await Task.findById(taskId).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  return task;
}

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const ws = await Workspace.findById(workspaceId).select('members').lean();
  if (!ws || !ws.members.some((m) => String(m.user) === userId)) {
    throw ApiError.badRequest('Assignee must be a member of the workspace');
  }
}

async function assertSprintOfProject(sprintId: string, projectId: string) {
  const count = await Sprint.countDocuments({ _id: sprintId, project: projectId });
  if (!count) throw ApiError.badRequest('Sprint does not belong to this project');
}

/** Enrich tasks with subtask/comment counts in bulk. */
async function attachCounts(projectId: string, tasks: any[]) {
  const ids = tasks.map((t) => String(t._id));
  const oids = ids.map((i) => new Types.ObjectId(i));
  const projectOid = new Types.ObjectId(projectId);
  const [sub, com] = await Promise.all([
    Task.aggregate([{ $match: { parent: { $in: oids }, project: projectOid } }, { $group: { _id: '$parent', count: { $sum: 1 } } }]),
    Comment.aggregate([{ $match: { subjectType: 'task', subjectId: { $in: oids } } }, { $group: { _id: '$subjectId', count: { $sum: 1 } } }]),
  ]);
  const subMap = new Map(sub.map((r) => [String(r._id), r.count]));
  const comMap = new Map(com.map((r) => [String(r._id), r.count]));
  return tasks.map((t: any) => ({ ...t.toJSON(), subtaskCount: subMap.get(String(t._id)) ?? 0, commentCount: comMap.get(String(t._id)) ?? 0 }));
}

// ══ Item router: /api/tasks ──────────────────────────────────────

export const itemRouter = Router();
itemRouter.use(requireAuth);

itemRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task: any = await loadTask(req.params.id);
    const ctx = await projectCtx(String(task.project), req.userId!);
    const [subtasks, comments, parent, watchers] = await Promise.all([
      Task.find({ parent: task._id }).populate([{ path: 'assignee', select: 'id name username avatarUrl' }]).sort('order createdAt'),
      Comment.find({ subjectType: 'task', subjectId: task._id }).sort('createdAt').populate('author', memberSelect),
      task.parent ? Task.findById(task.parent).select('key title status') : null,
      Task.findById(task._id).select('watchers').populate('watchers', 'id name username avatarUrl'),
    ]);
    ok(res, {
      ...task.toJSON(),
      subtasks: subtasks.map((s: any) => s.toJSON()),
      comments: comments.map((c: any) => c.toJSON()),
      parentTask: parent ? { id: String(parent._id), key: parent.key, title: parent.title, status: parent.status } : null,
      watchers: watchers ? watchers.watchers.map((w: any) => w.toJSON()) : [],
      watching: (watchers?.watchers ?? []).some((w: any) => String(w._id) === req.userId),
      myRole: ctx.role,
    });
  })
);

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedHours: z.number().min(0).max(10000).optional(),
  actualHours: z.number().min(0).max(100000).optional(),
  sprint: z.string().nullable().optional(),
  labels: z.array(z.string().trim().max(30)).max(20).optional(),
});

const SELF_EDITABLE = new Set(['status', 'actualHours']);

itemRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, updateSchema);
    const task: any = await loadTask(req.params.id);
    const ctx = await projectCtx(String(task.project), req.userId!);
    const isAssignee = task.assignee && String(task.assignee._id) === req.userId;

    const fields = Object.keys(body);
    if (fields.length === 0) throw ApiError.badRequest('No fields to update');
    if (!ctx.isManager) {
      if (!isAssignee || !fields.every((f) => SELF_EDITABLE.has(f))) {
        throw ApiError.forbidden('Only the assignee may change a task status; MANAGER+ can edit any field');
      }
    }

    const oldStatus = task.status;
    const oldAssignee = task.assignee ? String(task.assignee._id) : null;
    const rawAssignee = body.assignee;
    const targetAssignee = rawAssignee === null || rawAssignee === '' ? null : rawAssignee;
    if (rawAssignee !== undefined && targetAssignee && targetAssignee !== oldAssignee) {
      await assertWorkspaceMember(ctx.workspaceId, targetAssignee);
    }
    if (body.sprint) await assertSprintOfProject(body.sprint, String(task.project));

    for (const k of fields) {
      const v = (body as Record<string, unknown>)[k];
      if (k === 'dueDate') task[k] = v == null ? null : new Date(v as string);
      else if (k === 'assignee') task[k] = targetAssignee ?? null;
      else task[k] = v;
    }
    if (task.status === 'DONE' && oldStatus !== 'DONE') task.completedAt = new Date();
    if (task.status !== 'DONE' && oldStatus === 'DONE') task.completedAt = null;
    await task.save();

    const payload = (await loadTask(String(task._id))).toJSON();
    const statusChanged = oldStatus !== task.status;
    const assigneeChanged = targetAssignee && targetAssignee !== oldAssignee;

    if (assigneeChanged && targetAssignee !== req.userId) {
      await notifyUser({
        userId: targetAssignee!, actorId: req.userId, workspaceId: ctx.workspaceId, projectId: ctx.projectId,
        type: 'task_assigned', title: `You were assigned ${task.key}`, body: task.title,
        link: `/projects/${ctx.projectId}/tasks/${String(task._id)}`,
      });
    }

    if (statusChanged) {
      await recordActivity({
        workspace: ctx.workspaceId, project: ctx.projectId, actor: req.userId,
        type: 'task.moved', subjectType: 'task', subjectId: task._id,
        title: `Moved ${task.key} from ${oldStatus} to ${task.status}`, meta: { from: oldStatus, to: task.status },
      });
      const watchIds: string[] = (task.watchers ?? []).map((w: any) => String(w));
      for (const uid of [...new Set(watchIds)]) {
        if (uid === req.userId || uid === oldAssignee) continue;
        await notifyUser({
          userId: uid, actorId: req.userId, workspaceId: ctx.workspaceId, projectId: ctx.projectId,
          type: 'task_status', title: `${task.key} is now ${task.status}`, body: task.title,
          link: `/projects/${ctx.projectId}/tasks/${String(task._id)}`,
        });
      }
      emitEvent('project', ctx.projectId, 'task:moved', { task: payload, actorId: req.userId });
    } else {
      await recordActivity({
        workspace: ctx.workspaceId, project: ctx.projectId, actor: req.userId,
        type: 'task.updated', subjectType: 'task', subjectId: task._id, title: `Updated ${task.key}`, meta: { fields },
      });
      emitEvent('project', ctx.projectId, 'task:updated', { task: payload, actorId: req.userId });
    }
    ok(res, payload);
  })
);

const moveSchema = z.object({ status: z.enum(TASK_STATUSES), toIndex: z.number().int().min(0).max(2000) });

itemRouter.post(
  '/:id/move',
  asyncHandler(async (req, res) => {
    const { status, toIndex } = parseBody(req, moveSchema);
    const task: any = await Task.findById(req.params.id).select('project status assignee workspace parent');
    if (!task) throw ApiError.notFound('Task not found');
    const ctx = await projectCtx(String(task.project), req.userId!);
    const isAssignee = task.assignee && String(task.assignee) === req.userId;
    if (!ctx.isManager && !isAssignee) throw ApiError.forbidden('Only the assignee or a MANAGER can move this task');

    const oldStatus = task.status;
    const isSubtask = Boolean(task.parent);
    const column = await Task.find({
      project: task.project,
      status,
      _id: { $ne: task._id },
      parent: isSubtask ? task.parent : null,
    })
      .sort({ order: 1, createdAt: 1 }).select('_id').lean();
    const ids = column.map((c) => String(c._id));
    const index = Math.max(0, Math.min(toIndex, ids.length));
    ids.splice(index, 0, String(task._id));

    const ops = ids.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: i, status } } },
    }));
    await Task.bulkWrite(ops);

    const updated: any = await Task.findById(task._id).populate(POPULATE);
    if (updated.status === 'DONE' && oldStatus !== 'DONE') {
      updated.completedAt = new Date();
      await updated.save();
    }
    if (updated.status !== 'DONE') {
      if (oldStatus === 'DONE') {
        updated.completedAt = null;
        await updated.save();
      }
    }
    const payload = updated.toJSON();

    if (oldStatus !== status) {
      await recordActivity({
        workspace: ctx.workspaceId, project: ctx.projectId, actor: req.userId,
        type: 'task.moved', subjectType: 'task', subjectId: task._id,
        title: `Moved ${payload.key} from ${oldStatus} to ${status}`, meta: { from: oldStatus, to: status },
      });
      const watchIds: string[] = (task.watchers ?? []).map((w: any) => String(w));
      for (const uid of [...new Set(watchIds)]) {
        if (uid === req.userId || (task.assignee && String(task.assignee) === uid)) continue;
        await notifyUser({
          userId: uid, actorId: req.userId, workspaceId: ctx.workspaceId, projectId: ctx.projectId,
          type: 'task_status', title: `${payload.key} is now ${status}`, body: payload.title,
          link: `/projects/${ctx.projectId}/tasks/${String(task._id)}`,
        });
      }
    }
    emitEvent('project', ctx.projectId, 'task:moved', { task: payload, actorId: req.userId, status, toIndex: index });
    ok(res, payload);
  })
);

itemRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const task: any = await Task.findById(req.params.id).select('project workspace key title');
    if (!task) throw ApiError.notFound('Task not found');
    const ctx = await projectCtx(String(task.project), req.userId!);
    if (!ctx.isManager) throw ApiError.forbidden('Requires MANAGER or higher to delete tasks');
    const childIds = await Task.find({ parent: task._id }).select('_id').lean();
    const allIds = [task._id, ...childIds.map((c) => c._id)];
    await Task.deleteMany({ _id: { $in: allIds } });
    await Comment.deleteMany({ subjectType: 'task', subjectId: { $in: allIds } });
    await recordActivity({
      workspace: ctx.workspaceId, project: ctx.projectId, actor: req.userId,
      type: 'task.deleted', title: `Deleted ${task.key} “${task.title}”`,
    });
    emitEvent('project', ctx.projectId, 'task:deleted', { id: String(task._id), actorId: req.userId });
    ok(res, { ok: true });
  })
);

const watchSchema = z.object({ watching: z.boolean() });

itemRouter.post(
  '/:id/watch',
  asyncHandler(async (req, res) => {
    const { watching } = parseBody(req, watchSchema);
    const task: any = await Task.findById(req.params.id).select('project watchers');
    if (!task) throw ApiError.notFound('Task not found');
    await projectCtx(String(task.project), req.userId!);
    const has = (task.watchers ?? []).some((w: any) => String(w) === req.userId);
    if (watching && !has) task.watchers.push(req.userId);
    if (!watching && has) task.watchers = task.watchers.filter((w: any) => String(w) !== req.userId);
    await task.save();
    ok(res, { watching });
  })
);

// ══ Collection router: full paths under /api/projects/:projectId/tasks ──

export const collectionRouter = Router();
collectionRouter.use(requireAuth);

const listQuery = z.object({
  status: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  label: z.string().optional(),
  sprint: z.string().optional(),
  q: z.string().optional(),
  parent: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().default('order'),
});

collectionRouter.get(
  '/projects/:projectId/tasks',
  asyncHandler(async (req, res) => {
    const query = parseQuery(req, listQuery);
    const projectId = req.params.projectId!;
    await projectCtx(projectId, req.userId!);
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = { project: projectId };
    if (query.status) filter.status = { $in: query.status.split(',') };
    if (query.assignee) filter.assignee = query.assignee === 'none' ? null : query.assignee;
    if (query.priority) filter.priority = { $in: query.priority.split(',') };
    if (query.label) filter.labels = query.label;
    if (query.q) filter.$or = [{ title: { $regex: esc(query.q), $options: 'i' } }, { key: { $regex: `^${esc(query.q)}`, $options: 'i' } }];
    if (query.sprint) filter.sprint = query.sprint === 'none' ? null : query.sprint;
    if (query.parent === 'none') filter.parent = null;
    else if (query.parent) filter.parent = query.parent;

    const sort: Record<string, 1 | -1> =
      query.sort === 'updatedAt' || query.sort === '-updatedAt'
        ? { updatedAt: -1 }
        : query.sort === 'dueDate'
          ? { dueDate: 1 }
          : { status: 1, order: 1, createdAt: 1 };

    const [total, docs] = await Promise.all([
      Task.countDocuments(filter),
      Task.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).populate(POPULATE),
    ]);
    ok(res, { items: await attachCounts(projectId, docs), total, page: query.page, limit: query.limit });
  })
);

const boardQuery = z.object({
  assignee: z.string().optional(),
  priority: z.string().optional(),
  label: z.string().optional(),
  q: z.string().optional(),
});

collectionRouter.get(
  '/projects/:projectId/tasks/board',
  asyncHandler(async (req, res) => {
    const q = parseQuery(req, boardQuery);
    const projectId = req.params.projectId!;
    await projectCtx(projectId, req.userId!);
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = { project: projectId, parent: null };
    if (q.assignee) filter.assignee = q.assignee === 'none' ? null : q.assignee;
    if (q.priority) filter.priority = q.priority;
    if (q.label) filter.labels = q.label;
    if (q.q) filter.title = { $regex: esc(q.q), $options: 'i' };

    const tasks = await Task.find(filter).sort({ order: 1, createdAt: 1 }).populate(POPULATE).limit(600);
    const enriched = await attachCounts(projectId, tasks);
    const columns = TASK_STATUSES.map((status) => ({ status, tasks: enriched.filter((t) => t.status === status) }));
    ok(res, { columns });
  })
);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignee: z.string().nullable().optional(),
  labels: z.array(z.string().trim().max(30)).max(20).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedHours: z.number().min(0).max(10000).optional(),
  sprint: z.string().nullable().optional(),
  parent: z.string().nullable().optional(),
});

collectionRouter.post(
  '/projects/:projectId/tasks',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createSchema);
    const ctx = await projectCtx(req.params.projectId!, req.userId!);
    if (!ctx.isManager) throw ApiError.forbidden('Requires MANAGER or higher to create tasks');

    const project = await Project.findById(ctx.projectId).select('key').lean();
    if (!project) throw ApiError.notFound('Project not found');
    if (body.parent) {
      const parent = await Task.findById(body.parent).select('_id project').lean();
      if (!parent || String(parent.project) !== ctx.projectId) throw ApiError.badRequest('Parent task must belong to this project');
    }
    if (body.assignee) await assertWorkspaceMember(ctx.workspaceId, body.assignee);
    if (body.sprint) await assertSprintOfProject(body.sprint, ctx.projectId);

    const number = await nextSeq(ctx.projectId, 'task');
    const status = body.status ?? 'TODO';
    const orderCount = await Task.countDocuments({ project: ctx.projectId, status });
    const task = await Task.create({
      workspace: ctx.workspaceId,
      project: ctx.projectId,
      number,
      key: `${project.key}-${number}`,
      title: body.title,
      description: body.description ?? '',
      status,
      priority: body.priority ?? 'MEDIUM',
      assignee: body.assignee ?? null,
      reporter: req.userId,
      labels: body.labels ?? [],
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      estimatedHours: body.estimatedHours ?? 0,
      sprint: body.sprint ?? null,
      parent: body.parent ?? null,
      order: orderCount,
      completedAt: status === 'DONE' ? new Date() : null,
    });
    const payload = (await loadTask(String(task._id))).toJSON();

    await recordActivity({
      workspace: ctx.workspaceId, project: ctx.projectId, actor: req.userId,
      type: body.parent ? 'task.created' : 'task.created', subjectType: 'task', subjectId: task._id,
      title: `Created task ${task.key} “${task.title}”`,
    });
    if (body.assignee && String(body.assignee) !== req.userId) {
      await notifyUser({
        userId: body.assignee, actorId: req.userId, workspaceId: ctx.workspaceId, projectId: ctx.projectId,
        type: 'task_assigned', title: `You were assigned ${task.key}`, body: task.title,
        link: `/projects/${ctx.projectId}/tasks/${String(task._id)}`,
      });
    }
    emitEvent('project', ctx.projectId, 'task:created', { task: { ...payload, subtaskCount: 0, commentCount: 0 }, actorId: req.userId });
    ok(res, { ...payload, subtaskCount: 0, commentCount: 0 }, 201);
  })
);

export default itemRouter;
