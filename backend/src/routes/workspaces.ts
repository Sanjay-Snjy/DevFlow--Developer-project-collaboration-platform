import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { access, hasWorkspaceRole, roleAtLeast } from '../middleware/access.js';
import { env } from '../config/env.js';
import { ADMIN_ROLES, MANAGE_ROLES, WORKSPACE_ROLES, type WorkspaceRole } from '../constants/index.js';
import { Workspace } from '../models/Workspace.js';
import { Invitation } from '../models/Invitation.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Issue } from '../models/Issue.js';
import { Comment } from '../models/Comment.js';
import { Sprint } from '../models/Sprint.js';
import { Notification } from '../models/Notification.js';
import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { randomToken, sha256, maskEmail } from '../utils/auth.js';
import { parseBody } from '../utils/validate.js';
import { recordActivity } from '../services/activityService.js';
import { notifyUser, pushToUser } from '../services/notifyService.js';
import { emitEvent } from '../socket.js';
import { memberSelect } from './helpers.js';
import { jsonTransform } from '../models/User.js';

const router = Router();
router.use(requireAuth);

const RANK: Record<WorkspaceRole, number> = { VIEWER: 0, DEVELOPER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaces = await Workspace.find({ 'members.user': req.userId })
      .select('name slug logoUrl description owner demo members')
      .lean();
    const list = workspaces.map((w) => ({
      ...w,
      id: String(w._id),
      _id: undefined,
      role: hasWorkspaceRole(w as never, req.userId!) ?? 'VIEWER',
      ownerId: String(w.owner),
    }));
    ok(res, list.map(({ members, __v, ...rest }) => ({ ...rest, members: undefined })));
  })
);

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/).optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, description, slug } = parseBody(req, createSchema);
    const base = slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    let candidate = base || 'workspace';
    let unique = false;
    for (let i = 0; i < 25 && !unique; i++) {
      const existing = await Workspace.findOne({ slug: candidate }).select('_id').lean();
      if (!existing) unique = true;
      else candidate = `${base}-${i + 2}`;
    }
    if (!unique) throw ApiError.conflict('Could not create a unique workspace URL, try a custom slug');

    const workspace = await Workspace.create({
      name,
      slug: candidate,
      description: description ?? '',
      owner: req.userId,
      members: [{ user: req.userId, role: 'OWNER' }],
    });
    await recordActivity({
      workspace: workspace._id,
      actor: req.userId,
      type: 'workspace.created',
      title: `Created workspace “${name}”`,
    });
    emitEvent('workspace', String(workspace._id), 'workspace:changed', { id: String(workspace._id) });
    ok(res, workspace.toJSON(), 201);
  })
);

router.get('/:workspaceId', ...access.wsMember(), asyncHandler(async (req, res) => {
  const ws = req.workspaceDoc!;
  const memberIds = ws.members.map((m: any) => String(m.user));
  const members = await User.find({ _id: { $in: memberIds } })
    .select(memberSelect)
    .lean();
  const roleMap = new Map(ws.members.map((m: any) => [String(m.user), m.role]));
  const users = members.map((u) => ({
    id: String(u._id),
    name: u.name,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl ?? '',
    bio: u.bio ?? '',
    skills: u.skills ?? [],
    githubUsername: u.githubUsername ?? '',
    role: roleMap.get(String(u._id)) ?? 'VIEWER',
    joinedAt: (ws.members.find((m: any) => String(m.user) === String(u._id)) as any)?.joinedAt ?? null,
  }));

  const [projectCount, taskTotal, doneTotal, openIssues, invitationCount] = await Promise.all([
    Project.countDocuments({ workspace: ws._id, archivedAt: null }),
    Task.countDocuments({ workspace: ws._id }),
    Task.countDocuments({ workspace: ws._id, status: 'DONE' }),
    Issue.countDocuments({ workspace: ws._id, status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    Invitation.countDocuments({ workspace: ws._id, status: 'PENDING' }),
  ]);

  ok(res, {
    id: ws.id ?? String(ws._id),
    name: ws.name,
    slug: ws.slug,
    description: ws.description,
    logoUrl: ws.logoUrl,
    ownerId: String(ws.owner),
    demo: ws.demo,
    createdAt: ws.createdAt,
    members: users,
    myRole: req.workspaceRole,
    stats: { projectCount, taskTotal, doneTotal, openIssues, invitationCount },
    invitationCount,
    settings: { defaultMemberRole: 'DEVELOPER' },
  });
}));

router.patch('/:workspaceId', ...access.wsAdmin(), asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    logoUrl: z.string().url().max(1000).optional().or(z.literal('')),
  });
  const body = parseBody(req, schema);
  Object.assign(req.workspaceDoc!, body);
  await req.workspaceDoc!.save();
  emitEvent('workspace', String(req.workspaceDoc!._id), 'workspace:changed', { id: String(req.workspaceDoc!._id) });
  ok(res, req.workspaceDoc!.toJSON());
}));

router.delete('/:workspaceId', ...access.wsMember(), asyncHandler(async (req, res) => {
  const ws = req.workspaceDoc!;
  if (req.workspaceRole !== 'OWNER') throw ApiError.forbidden('Only the workspace owner can delete a workspace');
  const workspaceId = ws._id;
  await Promise.all([
    Task.deleteMany({ workspace: workspaceId }),
    Issue.deleteMany({ workspace: workspaceId }),
    Comment.deleteMany({ workspace: workspaceId }),
    Sprint.deleteMany({ workspace: workspaceId }),
    Project.deleteMany({ workspace: workspaceId }),
    Invitation.deleteMany({ workspace: workspaceId }),
    Activity.deleteMany({ workspace: workspaceId }),
    Notification.deleteMany({ workspace: workspaceId }),
    Workspace.deleteOne({ _id: workspaceId }),
  ]);
  emitEvent('workspace', String(workspaceId), 'workspace:deleted', { id: String(workspaceId) });
  ok(res, { ok: true });
}));

// ── Members ──────────────────────────────────────────────────────

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(WORKSPACE_ROLES).default('DEVELOPER'),
});

router.post('/:workspaceId/members', ...access.wsAdmin(), asyncHandler(async (req, res) => {
  const { email, role } = parseBody(req, addMemberSchema);
  if (role === 'OWNER') throw ApiError.badRequest('OWNER role cannot be granted via invites');
  const target = await User.findOne({ email }).select('_id name username');
  if (!target) throw ApiError.notFound('No DevFlow account exists for this email yet — invite them instead');
  const ws = req.workspaceDoc!;
  const existing = ws.members.find((m: any) => String(m.user) === String(target._id));
  if (existing) throw ApiError.conflict('This user is already a member');
  ws.members.push({ user: target._id, role, joinedAt: new Date() });
  await ws.save();
  const projectIds = await Project.find({ workspace: ws._id }).select('_id').lean();
  await Promise.all(
    projectIds.map((p) => Project.updateOne({ _id: p._id }, { $addToSet: { members: target._id } }))
  );
  await recordActivity({ workspace: ws._id, actor: req.userId, type: 'member.joined', title: `Added ${target.name} to the workspace` });
  await notifyUser({
    userId: target._id, actorId: req.userId, workspaceId: ws._id,
    type: 'member_added', title: `You were added to ${ws.name}`, body: `Role: ${role}`,
    link: `/workspaces/${String(ws._id)}`,
  });
  pushToUser(String(target._id), 'membership.changed', { workspaceId: String(ws._id), role });
  emitEvent('workspace', String(ws._id), 'workspace:changed', { id: String(ws._id) });
  ok(res, { ok: true }, 201);
}));

const roleSchema = z.object({ role: z.enum(WORKSPACE_ROLES) });

router.patch('/:workspaceId/members/:userId/role', ...access.wsAdmin(), asyncHandler(async (req, res) => {
  const { role } = parseBody(req, roleSchema);
  const ws = req.workspaceDoc!;
  const targetId = req.params.userId;
  const member = ws.members.find((m: any) => String(m.user) === targetId);
  if (!member) throw ApiError.notFound('Member not found');
  if (member.role === 'OWNER') throw ApiError.badRequest('The workspace owner role cannot be changed directly — transfer ownership instead');
  const oldRole = member.role;
  if (role === 'OWNER') {
    if (req.workspaceRole !== 'OWNER') throw ApiError.forbidden('Only the owner can transfer ownership');
    const currentOwner = ws.members.find((m: any) => String(m.user) === req.userId);
    if (currentOwner) currentOwner.role = 'ADMIN';
    member.role = 'OWNER';
    ws.owner = member.user;
  } else {
    if (RANK[role] >= RANK[req.workspaceRole!]) {
      throw ApiError.forbidden('You cannot grant a role equal or higher to your own');
    }
    member.role = role;
  }
  await ws.save();
  const target = await User.findById(targetId).select('name').lean();
  await recordActivity({
    workspace: ws._id, actor: req.userId, type: 'member.role_changed', title: `Changed ${target?.name ?? 'a member'}'s role to ${role}`,
    meta: { from: oldRole, to: role, userId: targetId },
  });
  pushToUser(targetId, 'membership.changed', { workspaceId: String(ws._id), role });
  emitEvent('workspace', String(ws._id), 'workspace:changed', { id: String(ws._id) });
  ok(res, { ok: true });
}));

router.delete('/:workspaceId/members/:userId', ...access.wsMember(), asyncHandler(async (req, res) => {
  const ws = req.workspaceDoc!;
  const targetId = req.params.userId;
  if (!ADMIN_ROLES.includes(req.workspaceRole!) && req.userId !== targetId) {
    throw ApiError.forbidden('Only admins can remove other members');
  }
  const member = ws.members.find((m: any) => String(m.user) === targetId);
  if (!member) throw ApiError.notFound('Member not found');
  if (member.role === 'OWNER') throw ApiError.badRequest('The workspace owner cannot be removed');
  if (member.role === 'ADMIN' && req.workspaceRole !== 'OWNER') throw ApiError.forbidden('Only the owner can remove admins');
  ws.members = ws.members.filter((m: any) => String(m.user) !== targetId);
  await ws.save();
  await Project.updateMany({ workspace: ws._id }, { $pull: { members: targetId } });
  await Task.updateMany({ workspace: ws._id, assignee: targetId }, { $set: { assignee: null } });
  await Issue.updateMany({ workspace: ws._id, assignee: targetId }, { $set: { assignee: null } });
  await recordActivity({ workspace: ws._id, actor: req.userId, type: 'member.removed', title: 'Removed a member from the workspace' });
  pushToUser(targetId, 'membership.changed', { workspaceId: String(ws._id), removed: true });
  emitEvent('workspace', String(ws._id), 'workspace:changed', { id: String(ws._id) });
  ok(res, { ok: true });
}));

/** Member profile page data scoped to the workspace (shared projects only). */
router.get('/:workspaceId/members/:userId/profile', ...access.wsMember(), asyncHandler(async (req, res) => {
  const ws = req.workspaceDoc!;
  const targetId = req.params.userId;
  const memberEntry = ws.members.find((m: any) => String(m.user) === targetId);
  if (!memberEntry) throw ApiError.notFound('Not a member of this workspace');
  const user = await User.findById(targetId).select('-passwordHash').lean();
  if (!user) throw ApiError.notFound('User not found');
  const projectIds = await Project.find({ workspace: ws._id, $or: [{ members: targetId }, { owner: targetId }] }).select('_id').lean();
  const ids = projectIds.map((p) => p._id);
  const [myProjects, assigned, completedTasks, recentActivity] = await Promise.all([
    Project.find({ _id: { $in: ids } }).select('id key name status').lean(),
    Task.find({ workspace: ws._id, assignee: targetId, status: { $ne: 'DONE' } })
      .select('key title status priority dueDate project').sort('dueDate').limit(50).populate('project', 'key name').lean(),
    Task.find({ workspace: ws._id, assignee: targetId, status: 'DONE' }).countDocuments(),
    Activity.find({ workspace: ws._id, actor: targetId })
      .select('type title createdAt project meta').sort('-createdAt').limit(10)
      .populate('project', 'key name').lean(),
  ]);
  ok(res, {
    profile: {
      id: String(user._id), name: user.name, username: user.username, email: user.email,
      avatarUrl: user.avatarUrl ?? '', bio: user.bio ?? '', skills: user.skills ?? [],
      githubUsername: user.githubUsername ?? '', joinedAt: memberEntry.joinedAt,
    },
    role: memberEntry.role,
    stats: { assigned: assigned.length, completedTasks, projects: myProjects.length },
    projects: myProjects.map((p) => ({ id: String(p._id), key: p.key, name: p.name, status: p.status })),
    tasks: assigned.map((t: any) => ({
      id: String(t._id), key: t.key, title: t.title, status: t.status, priority: t.priority,
      dueDate: t.dueDate, project: t.project ? { id: String(t.project._id), key: t.project.key, name: t.project.name } : null,
    })),
    recentActivity: recentActivity.map((a: any) => ({
      id: String(a._id), type: a.type, title: a.title, createdAt: a.createdAt,
      project: a.project ? { id: String(a.project._id), key: a.project.key, name: a.project.name } : null,
    })),
  });
}));

// ── Invitations (admin side) ─────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(WORKSPACE_ROLES).default('DEVELOPER'),
  message: z.string().trim().max(300).optional(),
});

router.post('/:workspaceId/invitations', ...access.wsAdmin(), asyncHandler(async (req, res) => {
  const { email, role, message } = parseBody(req, inviteSchema);
  if (role === 'OWNER') throw ApiError.badRequest('OWNER cannot be granted by invitation');
  if (RANK[role] >= RANK[req.workspaceRole!]) throw ApiError.forbidden('You cannot invite with a role equal or higher to your own');
  const ws = req.workspaceDoc!;
  const existingMember = await User.findOne({ email }).select('_id').lean();
  if (existingMember) {
    const isMember = ws.members.some((m: any) => String(m.user) === String(existingMember._id));
    if (isMember) throw ApiError.conflict('This user is already a workspace member');
  }
  const open = await Invitation.findOne({ workspace: ws._id, email, status: 'PENDING' }).lean();
  if (open) throw ApiError.conflict('A pending invitation already exists for this email');

  const token = randomToken(24);
  const invite = await Invitation.create({
    workspace: ws._id, email, role, invitedBy: req.userId,
    tokenHash: sha256(token), status: 'PENDING',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  const webOrigin = env.corsOrigins[0] ?? `${req.protocol}://${req.get('host')}`;
  const acceptLink = `${webOrigin}/invitations?token=${token}`;
  if (existingMember) {
    await notifyUser({
      userId: existingMember._id, actorId: req.userId, workspaceId: ws._id,
      type: 'workspace_invite', title: `Invitation to join ${ws.name}`, body: `${message ?? ''} Role: ${role}`.trim(),
      link: `/invitations?token=${token}`,
    });
  }
  await recordActivity({ workspace: ws._id, actor: req.userId, type: 'member.joined', title: `Invited ${maskEmail(email)} to the workspace` });
  emitEvent('workspace', String(ws._id), 'workspace:changed', { id: String(ws._id) });
  ok(res, {
    id: String(invite._id),
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    acceptToken: token, // shown once so it can be shared with the invitee
    acceptLink,
  }, 201);
}));

router.get('/:workspaceId/invitations', ...access.wsAdmin(), asyncHandler(async (req, res) => {
  const invites = await Invitation.find({ workspace: req.params.workspaceId })
    .sort('-createdAt').limit(50)
    .populate('invitedBy', 'name username avatarUrl').lean();
  ok(res, invites.map((i: any) => ({
    id: String(i._id), email: maskEmail(i.email), role: i.role, status: i.status,
    expiresAt: i.expiresAt, createdAt: i.createdAt,
    invitedBy: i.invitedBy ? { id: String(i.invitedBy._id), name: i.invitedBy.name, username: i.invitedBy.username } : null,
  })));
}));

router.post('/:workspaceId/invitations/:inviteId/revoke', ...access.wsAdmin(), asyncHandler(async (req, res) => {
  const invite = await Invitation.findOneAndUpdate(
    { _id: req.params.inviteId, workspace: req.params.workspaceId, status: 'PENDING' },
    { $set: { status: 'REVOKED' } },
    { new: true }
  );
  if (!invite) throw ApiError.notFound('Pending invitation not found');
  emitEvent('workspace', String(req.params.workspaceId), 'workspace:changed', { id: req.params.workspaceId });
  ok(res, { ok: true });
}));

export default router;
