import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { PROJECT_STATUSES, PRIORITIES, type Priority, type ProjectStatus } from '../constants/index.js';
import { jsonTransform } from './User.js';

const linkedRepoSchema = new Schema(
  {
    fullName: { type: String, required: true }, // owner/name
    owner: { type: String, required: true },
    name: { type: String, required: true },
    defaultBranch: { type: String, default: 'main' },
    linkedBy: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    linkedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const projectSchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    key: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z][A-Z0-9]{1,5}$/ },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: PROJECT_STATUSES, default: 'PLANNING', index: true },
    priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
    owner: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    members: { type: [mongoose.Types.ObjectId], ref: 'User', default: [] },
    startDate: { type: Date },
    dueDate: { type: Date },
    repositories: { type: [linkedRepoSchema], default: [] },
    archivedAt: { type: Date },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

projectSchema.index({ workspace: 1, key: 1 }, { unique: true });
projectSchema.index({ workspace: 1, members: 1 });

export const Project: any = (mongoose.models as Record<string, any>).Project ?? model('Project', projectSchema);

export type ProjectPriority = Priority;
export type ProjectStatusType = ProjectStatus;
export type LinkedRepo = {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  linkedBy: mongoose.Types.ObjectId;
  linkedAt: Date;
};
