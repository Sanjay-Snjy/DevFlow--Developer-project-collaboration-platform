import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { NOTIFICATION_TYPES } from '../constants/index.js';
import { jsonTransform } from './User.js';

const notificationSchema = new Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    actor: { type: mongoose.Types.ObjectId, ref: 'User', default: null },
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', default: null },
    project: { type: mongoose.Types.ObjectId, ref: 'Project', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'system' },
    title: { type: String, required: true, maxlength: 300 },
    body: { type: String, default: '', maxlength: 2000 },
    link: { type: String, default: '', maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

export const Notification: any = (mongoose.models as Record<string, any>).Notification ?? model('Notification', notificationSchema);
