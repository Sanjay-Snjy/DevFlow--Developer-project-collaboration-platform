import type { Types } from 'mongoose';
import { Notification } from '../models/Notification.js';
import { emitEvent } from '../socket.js';

type NotifyInput = {
  userId: Types.ObjectId | string;
  actorId?: Types.ObjectId | string | null;
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** Map notification type → user preference key. */
  prefKey?: 'taskAssigned' | 'mentions' | 'comments' | 'projectActivity' | 'githubActivity' | 'aiNotifications';
};

const TYPE_TO_PREF: Record<string, NotifyInput['prefKey']> = {
  task_assigned: 'taskAssigned',
  issue_assigned: 'taskAssigned',
  mention: 'mentions',
  comment: 'comments',
  member_added: 'projectActivity',
  project_added: 'projectActivity',
  workspace_invite: 'projectActivity',
  task_status: 'projectActivity',
  github_activity: 'githubActivity',
  ai_complete: 'aiNotifications',
};

/**
 * Creates a notification for a user and pushes it over their personal socket room.
 * Respects each user's notification preferences. Returns null when suppressed.
 */
export async function notifyUser(input: NotifyInput): Promise<Record<string, unknown> | null> {
  const pref = TYPE_TO_PREF[input.type];
  if (pref) {
    const allowed = await import('../models/User.js').then(({ User }) =>
      User.findById(input.userId).select('notificationPrefs').lean()
    );
    if (allowed && allowed.notificationPrefs?.[pref] === false) return null;
  }

  const doc = await Notification.create({
    user: input.userId,
    actor: input.actorId ?? null,
    workspace: input.workspaceId ?? null,
    project: input.projectId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? '',
    link: input.link ?? '',
  });

  const unreadCount = await Notification.countDocuments({ user: input.userId, readAt: null });

  emitEvent('user', String(input.userId), 'notification:created', {
    notification: {
      id: String(doc._id),
      actor: input.actorId ? String(input.actorId) : null,
      workspace: input.workspaceId ? String(input.workspaceId) : null,
      project: input.projectId ? String(input.projectId) : null,
      type: doc.type,
      title: doc.title,
      body: doc.body,
      link: doc.link,
      readAt: null,
      createdAt: doc.createdAt,
    },
    unreadCount,
  });

  return { id: String(doc._id), unreadCount };
}

/** Push a transient realtime event (no persistence) to a user's socket room. */
export function pushToUser(userId: string, event: string, payload: unknown) {
  emitEvent('user', userId, event, payload);
}
