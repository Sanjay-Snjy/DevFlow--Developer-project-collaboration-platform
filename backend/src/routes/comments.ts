import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Comment } from '../models/Comment.js';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { Project } from '../models/Project.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { parseBody } from '../utils/validate.js';
import { hasWorkspaceRole, roleAtLeast } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { recordActivity } from '../services/activityService.js';
import { notifyUser } from '../services/notifyService.js';
import { emitEvent } from '../socket.js';
import { memberSelect } from './helpers.js';

const router = Router();
router.use(requireAuth);

const SUBJECT_MODEL: Record<string, { model: typeof Task; kind: 'task' } | { model: typeof Issue; kind: 'issue' }> = {
  tasks: { model: Task, kind: 'task' },
  issues: { model: Issue, kind: 'issue' },
};

async function authorizeSubject(subjectType: string, subjectId: string, userId: string) {
  const map = SUBJECT_MODEL[subjectType];
  if (!map) throw ApiError.badRequest('subject must be tasks or issues');
  const subject: any = await map.model.findById(subjectId).select('project workspace reporter assignee title key');
  if (!subject) throw ApiError.notFound(`${map.kind === 'task' ? 'Task' : 'Issue'} not found`);
  const project = await Project.findById(subject.project).select('members').lean();
  const ws = await Workspace.findById(subject.workspace).select('members').lean();
  if (!project || !ws) throw ApiError.notFound('Parent resource not found');
  const role = hasWorkspaceRole(ws as never, userId);
  if (!role) throw ApiError.forbidden('You are not a member of this workspace');
  const isAdmin = ADMIN_ROLES.includes(role);
  const members = (project.members ?? []).map(String);
  if (!members.includes(userId) && !isAdmin) throw ApiError.forbidden('You are not a member of this project');
  return { ...map, subject, role, projectId: String(project._id), workspaceId: String(subject.workspace) };
}

function findMentions(content: string): string[] {
  const matches = content.matchAll(/@([a-z0-9_]{2,24})/gi);
  return [...matches].map((m) => m[1].toLowerCase());
}

async function resolveMentions(workspaceId: string, usernames: string[]): Promise<string[]> {
  if (!usernames.length) return [];
  const users = await User.find({ username: { $in: usernames } }).select('_id').lean();
  if (!users.length) return [];
  const ws = await Workspace.findById(workspaceId).select('members').lean();
  const memberSet = new Set((ws?.members ?? []).map((m) => String(m.user)));
  return users.filter((u) => memberSet.has(String(u._id))).map((u) => String(u._id));
}

const commentSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  parentId: z.string().nullable().optional(),
});

// GET/POST comments on a subject: /api/tasks/:id/comments and /api/issues/:id/comments
router.get(
  '/:subjectType/:subjectId/comments',
  asyncHandler(async (req, res) => {
    const { subjectType, subjectId } = req.params;
    await authorizeSubject(subjectType, subjectId, req.userId!);
    const comments = await Comment.find({ subjectType: subjectType === 'tasks' ? 'task' : 'issue', subjectId })
      .sort('createdAt')
      .populate('author', memberSelect);
    ok(res, comments.map((c) => c.toJSON()));
  })
);

router.post(
  '/:subjectType/:subjectId/comments',
  asyncHandler(async (req, res) => {
    const { subjectType, subjectId } = req.params;
    const body = parseBody(req, commentSchema);
    const auth = await authorizeSubject(subjectType, subjectId, req.userId!);
    const kind = subjectType === 'tasks' ? 'task' : 'issue';
    const mentions = await resolveMentions(auth.workspaceId, findMentions(body.content));
    const comment = await Comment.create({
      workspace: auth.workspaceId,
      project: auth.projectId,
      subjectType: kind,
      subjectId,
      author: req.userId,
      content: body.content,
      parentId: body.parentId ?? null,
      mentions,
    });
    const payload = (await Comment.findById(comment._id).populate('author', memberSelect)).toJSON();
    await recordActivity({
      workspace: auth.workspaceId, project: auth.projectId, actor: req.userId,
      type: 'comment.added', subjectType: kind, subjectId,
      title: `Commented on ${auth.subject.key} “${auth.subject.title}”`,
    });
    // Notify mentioned users (unless it's their own comment)
    for (const uid of mentions) {
      if (uid === req.userId) continue;
      await notifyUser({
        userId: uid, actorId: req.userId, workspaceId: auth.workspaceId, projectId: auth.projectId,
        type: 'mention', title: `${req.user!.name} mentioned you in ${auth.subject.key}`,
        body: body.content.slice(0, 180),
        link: `/projects/${auth.projectId}/${kind === 'task' ? 'tasks' : 'issues'}/${subjectId}`,
      });
    }
    // Let watchers + reporter of a task know about a comment
    const watcherIds = (auth.subject.watchers ?? []).map(String);
    const notifyIds = [...new Set([...(kind === 'task' ? watcherIds : []), String(auth.subject.reporter)])].filter(
      (id) => id !== req.userId && !mentions.includes(id)
    );
    for (const uid of notifyIds) {
      await notifyUser({
        userId: uid, actorId: req.userId, workspaceId: auth.workspaceId, projectId: auth.projectId,
        type: 'comment', title: `New comment on ${auth.subject.key}`, body: body.content.slice(0, 180),
        link: `/projects/${auth.projectId}/${kind === 'task' ? 'tasks' : 'issues'}/${subjectId}`,
      });
    }
    emitEvent('project', auth.projectId, 'comment:created', { comment: payload, subjectType: kind, subjectId, actorId: req.userId });
    ok(res, payload, 201);
  })
);

const editSchema = z.object({ content: z.string().trim().min(1).max(10000) });

router.patch(
  '/comments/:commentId',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, editSchema);
    const comment: any = await Comment.findById(req.params.commentId);
    if (!comment) throw ApiError.notFound('Comment not found');
    if (String(comment.author) !== req.userId) throw ApiError.forbidden('You can only edit your own comments');
    const project = await Project.findById(comment.project).select('key').lean();
    comment.content = body.content;
    comment.editedAt = new Date();
    comment.mentions = await resolveMentions(String(comment.workspace), findMentions(body.content));
    await comment.save();
    const payload = (await Comment.findById(comment._id).populate('author', memberSelect)).toJSON();
    emitEvent('project', String(comment.project), 'comment:updated', {
      comment: payload, subjectType: comment.subjectType, subjectId: String(comment.subjectId), actorId: req.userId,
    });
    void project;
    ok(res, payload);
  })
);

router.delete(
  '/comments/:commentId',
  asyncHandler(async (req, res) => {
    const comment: any = await Comment.findById(req.params.commentId);
    if (!comment) throw ApiError.notFound('Comment not found');
    const project = await Project.findById(comment.project).select('members').lean();
    const ws = await Workspace.findById(comment.workspace).select('members').lean();
    const role = ws ? hasWorkspaceRole(ws as never, req.userId!) : null;
    const isAdmin = role ? ADMIN_ROLES.includes(role) : false;
    const members = (project?.members ?? []).map(String);
    const canManage = role ? roleAtLeast(role, 'MANAGER') : false;
    const isAuthor = String(comment.author) === req.userId;
    if (!isAuthor && !(isAdmin && members.includes(req.userId!)) && !canManage) {
      throw ApiError.forbidden('You can only delete your own comments (or as a manager)');
    }
    await Comment.deleteOne({ _id: comment._id });
    await recordActivity({
      workspace: comment.workspace, project: comment.project, actor: req.userId,
      type: 'comment.deleted', subjectType: comment.subjectType, subjectId: comment.subjectId, title: 'Deleted a comment',
    });
    emitEvent('project', String(comment.project), 'comment:deleted', {
      id: String(comment._id), subjectType: comment.subjectType, subjectId: String(comment.subjectId), actorId: req.userId,
    });
    ok(res, { ok: true });
  })
);

export default router;
