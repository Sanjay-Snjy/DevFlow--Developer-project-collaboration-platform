import type { Types } from 'mongoose';
import { Activity } from '../models/Activity.js';
import { emitEvent } from '../socket.js';

type ActivityInput = {
  workspace: Types.ObjectId | string;
  project?: Types.ObjectId | string | null;
  actor?: Types.ObjectId | string | null;
  type: string;
  subjectType?: string;
  subjectId?: Types.ObjectId | string | null;
  title?: string;
  meta?: Record<string, unknown>;
};

/** Persists an activity entry and broadcasts it to the workspace room in real time. */
export async function recordActivity(input: ActivityInput) {
  const doc = await Activity.create(input);
  emitEvent('workspace', String(input.workspace), 'activity:created', {
    activity: {
      id: String(doc._id),
      workspace: String(input.workspace),
      project: input.project ? String(input.project) : null,
      actor: input.actor ? String(input.actor) : null,
      type: input.type,
      subjectType: input.subjectType ?? '',
      subjectId: input.subjectId ? String(input.subjectId) : null,
      title: input.title ?? '',
      meta: input.meta ?? {},
      createdAt: doc.createdAt,
    },
  });
  return doc;
}
