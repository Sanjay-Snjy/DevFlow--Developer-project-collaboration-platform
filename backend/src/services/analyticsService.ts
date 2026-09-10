import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { Sprint } from '../models/Sprint.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { Activity } from '../models/Activity.js';
import { TASK_STATUSES } from '../constants/index.js';

const WEEKS = 12;

/** Monday 00:00:00.000Z for the week containing `date` (UTC — matches MongoDB $dateTrunc). */
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

/** Fills 12 weekly buckets (label = ISO date of the Monday). */
function weeklySeries(points: Array<{ _id: Date; count: number; hours?: number }>, withHours: boolean) {
  const anchor = mondayOf(new Date());
  const buckets: Array<{ week: string; count: number; hours?: number }> = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const monday = new Date(anchor);
    monday.setUTCDate(monday.getUTCDate() - i * 7);
    const p = points.find((x) => x._id && new Date(x._id).getTime() === monday.getTime());
    buckets.push({
      week: monday.toISOString().slice(0, 10),
      count: p?.count ?? 0,
      hours: withHours ? p?.hours ?? 0 : undefined,
    });
  }
  return buckets;
}

export async function projectAnalytics(projectId: string) {
  const oid = new mongoose.Types.ObjectId(projectId);
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [statusAgg, priorityAgg, assigneeAgg, weekAgg, issueAgg, avgDays, sprints, openIssues, totalIssues] = await Promise.all([
    Task.aggregate([{ $match: { project: oid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: { project: oid } }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Task.aggregate([
      { $match: { project: oid, assignee: { $ne: null } } },
      {
        $group: {
          _id: '$assignee',
          open: { $sum: { $cond: [{ $ne: ['$status', 'DONE'] }, 1, 0] } },
          done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
          estOpen: { $sum: { $cond: [{ $ne: ['$status', 'DONE'] }, '$estimatedHours', 0] } },
          total: { $sum: 1 },
        },
      },
    ]),
    Task.aggregate([
      { $match: { project: oid, completedAt: { $ne: null, $gte: since } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$completedAt', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } },
          count: { $sum: 1 },
          hours: { $sum: '$estimatedHours' },
        },
      },
    ]),
    Issue.aggregate([
      { $match: { project: oid, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } },
          opened: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $ne: ['$resolvedAt', null] }, 1, 0] } },
        },
      },
    ]),
    Task.aggregate([
      { $match: { project: oid, completedAt: { $ne: null } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$completedAt', '$createdAt'] } } } },
    ]),
    Sprint.find({ project: oid }).sort('-createdAt').lean(),
    Issue.countDocuments({ project: oid, status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    Issue.countDocuments({ project: oid }),
  ]);

  const totalTasks = statusAgg.reduce((a, s) => a + s.count, 0);
  const doneTasks = statusAgg.find((s) => s._id === 'DONE')?.count ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in14 = new Date(today);
  in14.setDate(in14.getDate() + 14);
  const dueTasks = await Task.find({
    project: oid, dueDate: { $ne: null, $lte: in14 }, status: { $ne: 'DONE' },
  }).select('key title dueDate status priority assignee').sort('dueDate').populate('assignee', 'name username avatarUrl').lean();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sprintStats = await Promise.all(
    sprints.map(async (s) => {
      const agg = await Task.aggregate([
        { $match: { sprint: s._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
            est: { $sum: '$estimatedHours' },
          },
        },
      ]);
      const row = agg[0] ?? { total: 0, done: 0, est: 0 };
      return {
        id: String(s._id),
        name: s.name,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        goal: s.goal,
        total: row.total,
        done: row.done,
        estHours: row.est,
        progress: row.total ? Math.round((row.done / row.total) * 100) : 0,
      };
    })
  );

  const completedPerWeek = weeklySeries(weekAgg as any, true).map((w) => ({ week: w.week, tasks: w.count, hours: w.hours ?? 0 }));
  const issuesPerWeek = issueAgg.map((r) => ({
    week: new Date(r._id).toISOString().slice(0, 10),
    opened: r.opened,
    resolved: r.resolved,
  }));

  return {
    totals: {
      totalTasks,
      doneTasks,
      openTasks: totalTasks - doneTasks,
      openIssues,
      totalIssues,
      blocked: statusAgg.find((s) => s._id === 'BLOCKED')?.count ?? 0,
      inProgress: statusAgg.find((s) => s._id === 'IN_PROGRESS')?.count ?? 0,
      completionRate: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
      avgCompletionDays: avgDays[0]?.avgMs != null ? Math.round((avgDays[0].avgMs / 86400000) * 10) / 10 : null,
    },
    byStatus: TASK_STATUSES.map((st) => ({ status: st, count: statusAgg.find((s) => s._id === st)?.count ?? 0 })),
    byPriority: priorityAgg.map((s) => ({ priority: s._id, count: s.count })),
    byAssignee: assigneeAgg.map((s) => ({ assignee: String(s._id), open: s.open, done: s.done, estOpen: s.estOpen, total: s.total })),
    completedPerWeek,
    issuesPerWeek,
    dueSoon: dueTasks.map((t: any) => ({
      id: String(t._id), key: t.key, title: t.title, dueDate: t.dueDate, status: t.status, priority: t.priority,
      overdue: t.dueDate < todayStart,
      assignee: t.assignee ? { id: String(t.assignee._id), name: t.assignee.name, username: t.assignee.username, avatarUrl: t.assignee.avatarUrl ?? '' } : null,
    })),
    sprints: sprintStats,
  };
}

export async function workspaceAnalytics(workspaceId: string, userId: string, myRole: string) {
  const isAdmin = ['OWNER', 'ADMIN'].includes(myRole);
  const oid = new mongoose.Types.ObjectId(workspaceId);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7 * (WEEKS - 1));

  const [projects, memberCount, taskStatus, issueStatus] = await Promise.all([
    isAdmin
      ? Project.find({ workspace: oid, archivedAt: null }).select('_id key name status dueDate').lean()
      :      Project.find({ workspace: oid, archivedAt: null, members: new mongoose.Types.ObjectId(userId) }).select('_id key name status dueDate').lean(),
    Workspace.findById(oid).select('members').lean().then((ws) => ws?.members?.length ?? 0),
    Task.aggregate([{ $match: { workspace: oid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Issue.aggregate([{ $match: { workspace: oid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  // Per-project progress (lookup in one pass)
  const projectIds = projects.map((p) => String(p._id));
  const taskAgg = projectIds.length
    ? await    Task.aggregate([
        { $match: { project: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } } } },
      ])
    : [];
  const taskMap = new Map<string, any>(taskAgg.map((t) => [String(t._id), t]));

  const [completedWeekly, activityDaily, memberLoad, openIssues, resolvedByWeekRaw] = await Promise.all([
    Task.aggregate([
      { $match: { workspace: oid, completedAt: { $ne: null, $gte: weekStart } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$completedAt', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } },
          count: { $sum: 1 },
          hours: { $sum: '$estimatedHours' },
        },
      },
    ]),
    Activity.aggregate([
      { $match: { workspace: oid, createdAt: { $gte: weekStart } } },
      { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: 'day', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { workspace: oid, assignee: { $ne: null } } },
      {
        $group: {
          _id: '$assignee',
          open: { $sum: { $cond: [{ $ne: ['$status', 'DONE'] }, 1, 0] } },
          done: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]),
    Issue.countDocuments({ workspace: oid, status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    Issue.aggregate([
      { $match: { workspace: oid, resolvedAt: { $ne: null, $gte: weekStart } } },
      { $group: { _id: { $dateTrunc: { date: '$resolvedAt', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
  ]);

  const totalTasks = taskStatus.reduce((a, s) => a + s.count, 0);
  const doneTasks = taskStatus.find((s) => s._id === 'DONE')?.count ?? 0;
  const issueTotal = issueStatus.reduce((a, s) => a + s.count, 0);

  return {
    totals: {
      projectCount: projects.length,
      membersCount: memberCount,
      totalTasks,
      doneTasks,
      openTasks: totalTasks - doneTasks,
      openIssues,
      totalIssues: issueTotal,
      completionRate: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
    },
    byStatus: taskStatus.map((s) => ({ status: s._id, count: s.count })),
    issueStatus: issueStatus.map((s) => ({ status: s._id, count: s.count })),
    projectProgress: projects.map((p: any) => {
      const agg = taskMap.get(String(p._id)) ?? { total: 0, done: 0 };
      return {
        id: String(p._id), key: p.key, name: p.name, status: p.status, dueDate: p.dueDate,
        total: agg.total, done: agg.done, progress: agg.total ? Math.round((agg.done / agg.total) * 100) : 0,
      };
    }),
    completedWeekly: weeklySeries(completedWeekly as any, true).map((w) => ({ week: w.week, tasks: w.count, hours: w.hours ?? 0 })),
    resolvedWeekly: weeklySeries(resolvedByWeekRaw as any, false).map((w) => ({ week: w.week, tasks: w.count })),
    activityDaily: activityDaily.map((d) => ({ day: new Date(d._id).toISOString().slice(0, 10), count: d.count })),
    memberLoad: memberLoad.map((m) => ({ member: String(m._id), open: m.open, done: m.done, total: m.total })),
  };
}
