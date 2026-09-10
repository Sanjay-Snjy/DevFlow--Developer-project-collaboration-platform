import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { WORKSPACE_ROLES, type WorkspaceRole } from '../constants/index.js';
import { jsonTransform } from './User.js';

const memberSchema = new Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: WORKSPACE_ROLES, default: 'DEVELOPER' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,60}$/ },
    description: { type: String, default: '', maxlength: 500 },
    logoUrl: { type: String, default: '', maxlength: 1000 },
    owner: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

workspaceSchema.index({ 'members.user': 1 });

export const Workspace: any = (mongoose.models as Record<string, any>).Workspace ?? model('Workspace', workspaceSchema);

export type WorkspaceMember = {
  user: mongoose.Types.ObjectId;
  role: WorkspaceRole;
  joinedAt: Date;
};
