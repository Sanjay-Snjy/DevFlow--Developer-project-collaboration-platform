import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { SUBJECT_TYPES, type SubjectType } from '../constants/index.js';
import { jsonTransform } from './User.js';

const commentSchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Types.ObjectId, ref: 'Project', required: true },
    subjectType: { type: String, enum: SUBJECT_TYPES, required: true },
    subjectId: { type: mongoose.Types.ObjectId, required: true },
    author: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 10000 },
    parentId: { type: mongoose.Types.ObjectId, default: null },
    mentions: { type: [mongoose.Types.ObjectId], ref: 'User', default: [] },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

commentSchema.index({ subjectType: 1, subjectId: 1, createdAt: 1 });
commentSchema.index({ author: 1, createdAt: -1 });

export const Comment: any = (mongoose.models as Record<string, any>).Comment ?? model('Comment', commentSchema);
export type SubjectTypeType = SubjectType;
