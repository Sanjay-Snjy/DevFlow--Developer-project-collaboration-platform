import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { jsonTransform } from './User.js';

const activitySchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Types.ObjectId, ref: 'Project', default: null },
    actor: { type: mongoose.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, required: true },
    subjectType: { type: String, default: '' },
    subjectId: { type: mongoose.Types.ObjectId, default: null },
    title: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

activitySchema.index({ workspace: 1, createdAt: -1 });
activitySchema.index({ project: 1, createdAt: -1 });
activitySchema.index({ actor: 1, createdAt: -1 });

export const Activity: any = (mongoose.models as Record<string, any>).Activity ?? model('Activity', activitySchema);
