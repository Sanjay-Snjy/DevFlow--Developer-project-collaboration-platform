import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { SPRINT_STATUSES, type SprintStatus } from '../constants/index.js';
import { jsonTransform } from './User.js';

const sprintSchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    goal: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: SPRINT_STATUSES, default: 'PLANNED' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

sprintSchema.index({ project: 1, status: 1, createdAt: -1 });

export const Sprint: any = (mongoose.models as Record<string, any>).Sprint ?? model('Sprint', sprintSchema);
export type SprintStatusType = SprintStatus;
