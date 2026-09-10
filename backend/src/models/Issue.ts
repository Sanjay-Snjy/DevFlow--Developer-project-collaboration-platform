import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES, type IssueStatus, type IssueType, type Priority } from '../constants/index.js';
import { jsonTransform } from './User.js';

const issueSchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Types.ObjectId, ref: 'Project', required: true },
    number: { type: Number, required: true },
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 20000 },
    type: { type: String, enum: ISSUE_TYPES, default: 'BUG' },
    priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
    status: { type: String, enum: ISSUE_STATUSES, default: 'OPEN' },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    reporter: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    assignee: { type: mongoose.Types.ObjectId, ref: 'User', default: null },
    labels: { type: [String], default: [] },
    environment: { type: String, default: '' },
    stepsToReproduce: { type: String, default: '' },
    expectedResult: { type: String, default: '' },
    actualResult: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    githubRefs: {
      type: [
        {
          url: { type: String, required: true },
          kind: { type: String, enum: ['issue', 'pr', 'commit', 'other'], default: 'other' },
          title: { type: String, default: '' },
        },
      ],
      default: [],
    },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

issueSchema.index({ workspace: 1, project: 1, number: 1 }, { unique: true });
issueSchema.index({ project: 1, status: 1, priority: 1 });
issueSchema.index({ workspace: 1, assignee: 1, status: 1 });
issueSchema.index({ workspace: 1, title: 'text', description: 'text' });

export const Issue: any = (mongoose.models as Record<string, any>).Issue ?? model('Issue', issueSchema);
export type IssueStatusType = IssueStatus;
export type IssueTypeType = IssueType;
