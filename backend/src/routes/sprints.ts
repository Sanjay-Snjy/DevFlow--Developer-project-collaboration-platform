import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { SPRINT_STATUSES } from '../constants/index.js';
import { Sprint } from '../models/Sprint.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseBody, parseQuery } from '../utils/validate.js';
import { hasWorkspaceRole, roleAtLeast } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { recordActivity } from '../services/activityService.js';
import { emitEvent } from '../socket.js';
import { memberSelect } from './helpers.js';

const router = Router();
router.use(requireAuth);

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
  return { isManager: roleAtLeast(role, 'MANAGER'), projectId: String(project._id), workspaceId: String(project.workspace) };
}

async function sprintStats(sprintId: string) {
  const agg = await Task.aggregate([
    { $match: { sprint: new mongoose.Types.ObjectId(sprintId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'BLOCKED'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
        estimated: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, '$estimatedHours', 0] } },
        remainingEst: { $sum: { $cond: [{ $ne: ['$status', 'DONE'] }, '$estimatedHours', 0] } },
      },
    },
  ]);
  const s = agg[0] ?? { total: 0, done: 0, blocked: 0, inProgress: 0, estimated: 0, remainingEst: 0 };
  return { ...s, progress: s.total ? Math.round((s.done / s.total) * 100) : 0 };
}

async function emitSprint(sprintId: string, projectId: string, event: string) {
  const sprint: any = await Sprint.findById(sprintId);
  emitEvent('project', projectId, event, { sprint: sprint ? sprint.toJSON() : { id: sprintId } });
}

// GET/POST collection: /api/projects/:projectId/sprints
router.get(
  '/projects/:projectId/sprints',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;
    await ctx(projectId, req.userId!);
    const sprints = await Sprint.find({ project: projectId }).sort('-createdAt');
    if (!sprints.length) {
      ok(res, { items: [] });
      return;
    }
    const sprintOids = sprints.map((s) => new mongoose.Types.ObjectId(String(s._id)));
    const statsAgg = await Task.aggregate([
      { $match: { sprint: { $in: sprintOids } } },
      {
        $group: {
          _id: '$sprint',
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ['$status', 'BLOCKED'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
          estimated: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, '$estimatedHours', 0] } },
          remainingEst: { $sum: { $cond: [{ $ne: ['$status', 'DONE'] }, '$estimatedHours', 0] } },
        },
      },
    ]);
    const statsMap = new Map(
      statsAgg.map((s) => [
        String(s._id),
        {
          total: s.total,
          done: s.done,
          blocked: s.blocked,
          inProgress: s.inProgress,
          estimated: s.estimated,
          remainingEst: s.remainingEst,
          progress: s.total ? Math.round((s.done / s.total) * 100) : 0,
        },
      ])
    );
    const defaultStat = { total: 0, done: 0, blocked: 0, inProgress: 0, estimated: 0, remainingEst: 0, progress: 0 };
    const items = sprints.map((s) => ({
      ...s.toJSON(),
      stats: statsMap.get(String(s._id)) ?? defaultStat,
    }));
    ok(res, { items });
  })
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  status: z.enum(SPRINT_STATUSES).optional(),
});

router.post(
  '/projects/:projectId/sprints',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;
    const c = await ctx(projectId, req.userId!);
    if (!c.isManager) throw ApiError.forbidden('Requires MANAGER or higher to create sprints');
    const body = parseBody(req, createSchema);
    const sprint = await Sprint.create({
      workspace: c.workspaceId,
      project: projectId,
      name: body.name,
      goal: body.goal ?? '',
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      status: body.status ?? 'PLANNED',
    });
    await recordActivity({
      workspace: c.workspaceId, project: projectId, actor: req.userId,
      type: 'sprint.created', subjectType: 'sprint', subjectId: sprint._id,
      title: `Created sprint “${sprint.name}”`,
    });
    emitEvent('project', projectId, 'sprint:created', { sprint: sprint.toJSON(), actorId: req.userId });
    ok(res, sprint.toJSON(), 201);
  })
);

// GET single with tasks
router.get(
  '/sprints/:id',
  asyncHandler(async (req, res) => {
    const sprint: any = await Sprint.findById(req.params.id);
    if (!sprint) throw ApiError.notFound('Sprint not found');
    await ctx(String(sprint.project), req.userId!);
    const [tasks, stats] = await Promise.all([
      Task.find({ sprint: sprint._id }).sort({ status: 1, order: 1 })
        .populate([{ path: 'assignee', select: memberSelect }, { path: 'reporter', select: memberSelect }]),
      sprintStats(String(sprint._id)),
    ]);
    ok(res, { ...sprint.toJSON(), tasks: tasks.map((t) => t.toJSON()), stats });
  })
);

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  status: z.enum(SPRINT_STATUSES).optional(),
});

router.patch(
  '/sprints/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, updateSchema);
    const sprint: any = await Sprint.findById(req.params.id);
    if (!sprint) throw ApiError.notFound('Sprint not found');
    const c = await ctx(String(sprint.project), req.userId!);
    if (!c.isManager) throw ApiError.forbidden('Requires MANAGER or higher to manage sprints');

    if (body.status === 'ACTIVE' && sprint.status !== 'ACTIVE') {
      // Only one active sprint per project; auto-complete any previous active sprint.
      await Sprint.updateMany({ project: sprint.project, status: 'ACTIVE', _id: { $ne: sprint._id } }, { $set: { status: 'COMPLETED' } });
      if (!sprint.startDate) sprint.startDate = new Date();
      if (!sprint.endDate) sprint.endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }
    if (body.status === 'COMPLETED' && sprint.status !== 'COMPLETED' && !sprint.endDate) sprint.endDate = new Date();

    Object.assign(sprint, body);
    for (const k of ['startDate', 'endDate'] as const) {
      if (body[k as keyof typeof body] !== undefined && sprint[k]) sprint[k] = new Date(sprint[k]);
    }
    await sprint.save();
    await recordActivity({
      workspace: c.workspaceId, project: String(sprint.project), actor: req.userId,
      type: 'sprint.updated', subjectType: 'sprint', subjectId: sprint._id,
      title: `Updated sprint “${sprint.name}”${body.status ? ` → ${body.status}` : ''}`,
    });
    emitEvent('project', String(sprint.project), 'sprint:updated', { sprint: sprint.toJSON(), actorId: req.userId });
    ok(res, sprint.toJSON());
  })
);

router.delete(
  '/sprints/:id',
  asyncHandler(async (req, res) => {
    const sprint: any = await Sprint.findById(req.params.id);
    if (!sprint) throw ApiError.notFound('Sprint not found');
    const c = await ctx(String(sprint.project), req.userId!);
    if (!c.isManager) throw ApiError.forbidden('Requires MANAGER or higher to delete sprints');
    await Task.updateMany({ sprint: sprint._id }, { $set: { sprint: null } });
    await Sprint.deleteOne({ _id: sprint._id });
    await recordActivity({
      workspace: c.workspaceId, project: String(sprint.project), actor: req.userId,
      type: 'sprint.updated', subjectType: 'sprint', subjectId: sprint._id, title: `Deleted sprint “${sprint.name}”`,
    });
    emitEvent('project', String(sprint.project), 'sprint:deleted', { id: String(sprint._id), actorId: req.userId });
    ok(res, { ok: true });
  })
);

const assignSchema = z.object({ taskIds: z.array(z.string().min(1)).max(200) });

router.post(
  '/sprints/:id/tasks',
  asyncHandler(async (req, res) => {
    const { taskIds } = parseBody(req, assignSchema);
    const sprint: any = await Sprint.findById(req.params.id);
    if (!sprint) throw ApiError.notFound('Sprint not found');
    const c = await ctx(String(sprint.project), req.userId!);
    if (!c.isManager) throw ApiError.forbidden('Requires MANAGER or higher to assign tasks to a sprint');
    const tasks = await Task.find({ _id: { $in: taskIds }, project: sprint.project }).select('_id').lean();
    if (tasks.length !== taskIds.length) throw ApiError.badRequest('Some tasks do not belong to this project');
    await Task.updateMany({ _id: { $in: taskIds } }, { $set: { sprint: sprint._id } });
    emitEvent('project', String(sprint.project), 'sprint:updated', { id: String(sprint._id), actorId: req.userId });
    ok(res, { ok: true, added: taskIds.length });
  })
);

router.delete(
  '/sprints/:id/tasks',
  asyncHandler(async (req, res) => {
    const { taskIds } = parseBody(req, assignSchema);
    const sprint: any = await Sprint.findById(req.params.id);
    if (!sprint) throw ApiError.notFound('Sprint not found');
    const c = await ctx(String(sprint.project), req.userId!);
    if (!c.isManager) throw ApiError.forbidden('Requires MANAGER or higher');
    await Task.updateMany({ _id: { $in: taskIds }, sprint: sprint._id }, { $set: { sprint: null } });
    emitEvent('project', String(sprint.project), 'sprint:updated', { id: String(sprint._id), actorId: req.userId });
    ok(res, { ok: true });
  })
);

export default router;
