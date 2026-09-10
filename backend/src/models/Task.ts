import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { PRIORITIES, TASK_STATUSES, type Priority, type TaskStatus } from '../constants/index.js';
import { jsonTransform } from './User.js';

const taskSchema = new Schema(
  {
    workspace: { type: mongoose.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Types.ObjectId, ref: 'Project', required: true },
    number: { type: Number, required: true },
    key: { type: String, required: true, trim: true }, // "PROJ-12"
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 20000 },
    status: { type: String, enum: TASK_STATUSES, default: 'TODO' },
    priority: { type: String, enum: PRIORITIES, default: 'MEDIUM' },
    assignee: { type: mongoose.Types.ObjectId, ref: 'User', default: null },
    reporter: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    labels: { type: [String], default: [] },
    dueDate: { type: Date, default: null },
    estimatedHours: { type: Number, default: 0, min: 0, max: 10000 },
    actualHours: { type: Number, default: 0, min: 0, max: 100000 },
    sprint: { type: mongoose.Types.ObjectId, ref: 'Sprint', default: null },
    parent: { type: mongoose.Types.ObjectId, ref: 'Task', default: null },
    order: { type: Number, default: 0 },
    watchers: { type: [mongoose.Types.ObjectId], ref: 'User', default: [] },
    completedAt: { type: Date, default: null },
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

taskSchema.index({ workspace: 1, project: 1, number: 1 }, { unique: true });
taskSchema.index({ project: 1, status: 1, order: 1 });
taskSchema.index({ workspace: 1, assignee: 1, status: 1 });
taskSchema.index({ project: 1, labels: 1 });
taskSchema.index({ sprint: 1 });
taskSchema.index({ parent: 1 });
taskSchema.index({ workspace: 1, title: 'text', description: 'text' });
taskSchema.index({ workspace: 1, dueDate: 1, status: 1 });

export const Task: any = (mongoose.models as Record<string, any>).Task ?? model('Task', taskSchema);
export type TaskPriority = Priority;
export type TaskStatusType = TaskStatus;
