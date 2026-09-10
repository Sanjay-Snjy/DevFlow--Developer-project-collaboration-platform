import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { INVITE_STATUSES, WORKSPACE_ROLES, type InviteStatus } from '../constants/index.js';
import { jsonTransform } from './User.js';

const invitationSchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: WORKSPACE_ROLES, default: 'DEVELOPER' },
    invitedBy: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: INVITE_STATUSES, default: 'PENDING' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

invitationSchema.index({ workspace: 1, email: 1, status: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invitation: any = (mongoose.models as Record<string, any>).Invitation ?? model('Invitation', invitationSchema);
export type InviteStatusType = InviteStatus;
