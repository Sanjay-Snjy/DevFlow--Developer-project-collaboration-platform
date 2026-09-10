import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Workspace } from '../models/Workspace.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { Comment } from '../models/Comment.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';
import { hasWorkspaceRole } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { callAi } from '../services/aiClient.js';
import { aiLimiter } from '../middleware/security.js';
import { memberSelect } from './helpers.js';

const router = Router();
router.use(requireAuth, aiLimiter);

const NOT_CONFIGURED = () => new ApiError(503, 'AI_NOT_CONFIGURED', 'AI features are not configured.');

async function projectGate(projectId: string, userId: string) {
  const project = await Project.findById(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  const ws = await Workspace.findById(project.workspace).select('members').lean();
  const role = ws ? hasWorkspaceRole(ws as never, userId) : null;
  if (!role) throw ApiError.forbidden('You are not a member of this workspace');
  const isAdmin = role && ADMIN_ROLES.includes(role);
  const members = (project.members ?? []).map(String);
  if (!members.includes(userId) && !isAdmin) throw ApiError.forbidden('You are not a member of this project');
  return project;
}

// ── 1. Task breakdown ────────────────────────────────────────────

const breakdownSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
});

router.post(
  '/task-breakdown',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, breakdownSchema);
    const result = await callAi<unknown>('/ai/task-breakdown', body);
    ok(res, result);
  })
);

// ── 2. Issue analysis ────────────────────────────────────────────

const analyzeSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(8000),
  stepsToReproduce: z.string().trim().max(5000).optional(),
  expectedResult: z.string().trim().max(3000).optional(),
  actualResult: z.string().trim().max(3000).optional(),
  environment: z.string().trim().max(500).optional(),
});

router.post(
  '/analyze-issue',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, analyzeSchema);
    const result = await callAi<unknown>('/ai/analyze-issue', body);
    ok(res, result);
  })
);

// ── 3. Project summary (context built from real DB data) ─────────

const summarySchema = z.object({ projectId: z.string().min(1), days: z.number().int().min(1).max(90).default(14) });

router.post(
  '/project-summary',
  asyncHandler(async (req, res) => {
    const { projectId, days } = parseBody(req, summarySchema);
    const project: any = await projectGate(projectId, req.userId!);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [completed, openIssues, recentActivity, comments, teamSize, repo] = await Promise.all([
      Task.find({ project: projectId, status: 'DONE', completedAt: { $gte: since } })
        .select('key title labels estimatedHours completedAt assignee').populate('assignee', 'name').lean(),
      Issue.find({ project: projectId, status: { $in: ['OPEN', 'IN_PROGRESS'] } })
        .select('key title type priority severity createdAt').limit(40).lean(),
      Task.find({ project: projectId, updatedAt: { $gte: since } }).countDocuments(),
      Comment.countDocuments({ project: projectId, createdAt: { $gte: since } }),
      Workspace.findById(project.workspace).select('members').lean().then((w: any) => w?.members?.length ?? 0),
      project.repositories?.map((r: any) => r.fullName) ?? [],
    ]);

    const completedByLabel = completed.reduce((acc: Record<string, number>, t: any) => {
      const isBug = (t.labels ?? []).some((l: string) => /bug|fix/i.test(l));
      acc[isBug ? 'bugFixes' : 'features'] += 1;
      return acc;
    }, { features: 0, bugFixes: 0 });

    ok(
      res,
      await callAi<unknown>('/ai/project-summary', {
        project: { name: project.name, key: project.key, description: project.description, status: project.status },
        days,
        window: { since: since.toISOString() },
        completedTasks: completed.map((t: any) => ({
          key: t.key, title: t.title, labels: t.labels ?? [], estimatedHours: t.estimatedHours ?? 0,
          assignee: t.assignee ? t.assignee.name : null,
        })),
        completedCount: completed.length,
        completedBreakdown: completedByLabel,
        openIssues: openIssues.map((i: any) => ({ key: i.key, title: i.title, type: i.type, priority: i.priority, severity: i.severity })),
        activityStats: { taskUpdates: recentActivity, comments },
        teamSize,
        linkedRepositories: repo,
      })
    );
  })
);

// ── 4. Sprint planning (real backlog + workload) ─────────────────

const planSchema = z.object({ projectId: z.string().min(1), sprintDays: z.number().int().min(3).max(30).default(14) });

router.post(
  '/sprint-plan',
  asyncHandler(async (req, res) => {
    const { projectId, sprintDays } = parseBody(req, planSchema);
    await projectGate(projectId, req.userId!);

    const project = await Project.findById(projectId).select('workspace name key').lean();
    const [backlog, wsDoc] = await Promise.all([
      Task.find({ project: projectId, status: { $ne: 'DONE' }, parent: null })
        .select('key title status priority dueDate estimatedHours sprint labels assignee').limit(120)
        .populate('assignee', 'name username').lean(),
      project
        ? Workspace.findById(project.workspace).select('members name').populate('members.user', 'name username').lean()
        : null,
    ]);
    const team = (wsDoc?.members ?? []).map((m: any) => ({
      userId: String(m.user._id ?? m.user),
      name: m.user?.name ?? '',
      username: m.user?.username ?? '',
      role: m.role,
    }));

    const workload = await Task.aggregate([
      { $match: { workspace: wsDoc?._id, assignee: { $ne: null }, status: { $ne: 'DONE' } } },
      { $group: { _id: '$assignee', openHours: { $sum: '$estimatedHours' }, openTasks: { $sum: 1 } } },
    ]);
    const workloadMap = new Map<string, any>(workload.map((w) => [String(w._id), w]));

    ok(
      res,
      await callAi<unknown>('/ai/sprint-plan', {
        projectName: project?.name ?? '',
        sprintDays,
        tasks: backlog.map((t: any) => ({
          key: t.key, title: t.title, status: t.status, priority: t.priority,
          dueDate: t.dueDate ?? null, estimatedHours: t.estimatedHours ?? 0,
          sprint: t.sprint ? String(t.sprint) : null,
          labels: t.labels ?? [],
          assignee: t.assignee ? { userId: String(t.assignee._id), name: t.assignee.name, username: t.assignee.username } : null,
        })),
        team: team
          .filter((m: any) => ['OWNER', 'ADMIN', 'MANAGER', 'DEVELOPER'].includes(m.role))
          .map((m: any) => ({
            userId: m.userId, name: m.name, username: m.username,
            openHours: workloadMap.get(m.userId)?.openHours ?? 0,
            openTasks: workloadMap.get(m.userId)?.openTasks ?? 0,
          })),
        teamCapacityHours: team.filter((m: any) => ['MANAGER', 'DEVELOPER'].includes(m.role)).length * 40 * (sprintDays / 14),
      })
    );
  })
);

export default router;
