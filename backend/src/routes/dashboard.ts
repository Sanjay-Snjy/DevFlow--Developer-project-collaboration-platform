import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { Workspace } from '../models/Workspace.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { Activity } from '../models/Activity.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { hasWorkspaceRole } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { memberSelect } from './helpers.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/workspaces/:workspaceId/dashboard',
  asyncHandler(async (req, res) => {
    const ws = await Workspace.findById(req.params.workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    const isAdmin = ADMIN_ROLES.includes(role);
    const wsId = String(ws._id);
    const myLimit = req.query.all === '1' ? 300 : 12;

    const visibleProjects = isAdmin
      ? await Project.find({ workspace: wsId, archivedAt: null }).select('_id key name status dueDate').lean()
      : await Project.find({ workspace: wsId, archivedAt: null, members: req.userId }).select('_id key name status dueDate').lean();
    const projectIds = visibleProjects.map((p) => String(p._id));

    const in14 = new Date();
    in14.setDate(in14.getDate() + 14);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      [myTasks, projectTasksAgg, openIssuesCount, activity],
      deadlines,
    ] = await Promise.all([
      Promise.all([
        Task.find({ workspace: wsId, assignee: req.userId, status: { $ne: 'DONE' } })
          .sort({ dueDate: 1, updatedAt: -1 }).limit(myLimit)
          .populate('project', 'key name').populate([{ path: 'assignee', select: memberSelect }]),
        Task.aggregate([
          { $match: { project: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
          { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } } } },
        ]),
        Issue.countDocuments({ workspace: wsId, status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
        Activity.find({ workspace: wsId }).sort('-createdAt').limit(16)
          .populate('actor', 'name username avatarUrl').populate('project', 'key name').lean(),
      ]),
      Task.find({
        workspace: wsId,
        project: { $in: projectIds },
        dueDate: { $ne: null, $lte: in14 },
        status: { $ne: 'DONE' },
      })
        .sort('dueDate').limit(8)
        .populate('project', 'key name').populate('assignee', memberSelect).lean(),
    ]);

    const taskMap = new Map<string, any>(projectTasksAgg.map((t) => [String(t._id), t]));
    const doneTotal = [...taskMap.values()].reduce((a: number, t: any) => a + t.done, 0);
    const totalAll = [...taskMap.values()].reduce((a: number, t: any) => a + t.total, 0);

    ok(res, {
      stats: {
        projects: visibleProjects.length,
        tasks: totalAll,
        openTasks: totalAll - doneTotal,
        completedTasks: doneTotal,
        openIssues: openIssuesCount,
        members: ws.members.length,
        myOpenTasks: myTasks.length,
        completionRate: totalAll ? Math.round((doneTotal / totalAll) * 100) : 0,
      },
      myTasks: myTasks.map((t: any) => ({
        id: String(t._id), key: t.key, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate,
        estimatedHours: t.estimatedHours,
        project: t.project ? { id: String(t.project._id), key: t.project.key, name: t.project.name } : null,
      })),
      projects: visibleProjects.map((p) => {
        const agg = taskMap.get(String(p._id)) ?? { total: 0, done: 0 };
        return {
          id: String(p._id), key: p.key, name: p.name, status: p.status, dueDate: p.dueDate,
          totalTasks: agg.total, doneTasks: agg.done,
          progress: agg.total ? Math.round((agg.done / agg.total) * 100) : 0,
        };
      }),
      deadlines: deadlines.map((t: any) => ({
        id: String(t._id), key: t.key, title: t.title, dueDate: t.dueDate, status: t.status, priority: t.priority,
        overdue: t.dueDate < today,
        assignee: t.assignee ? { id: String(t.assignee._id), name: t.assignee.name, username: t.assignee.username, avatarUrl: t.assignee.avatarUrl ?? '' } : null,
        project: t.project ? { id: String(t.project._id), key: t.project.key, name: t.project.name } : null,
      })),
      activity: activity.map((a: any) => ({
        id: String(a._id), type: a.type, title: a.title, createdAt: a.createdAt, meta: a.meta ?? {},
        actor: a.actor ? { id: String(a.actor._id), name: a.actor.name, username: a.actor.username, avatarUrl: a.actor.avatarUrl ?? '' } : null,
        project: a.project ? { id: String(a.project._id), key: a.project.key, name: a.project.name } : null,
      })),
    });
  })
);

export default router;
