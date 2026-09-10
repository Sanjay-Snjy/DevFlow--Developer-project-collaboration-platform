import mongoose from 'mongoose';
import type { Model } from 'mongoose';
const { Schema, model } = mongoose;
import { jsonTransform } from './User.js';

const githubAccountSchema = new Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: 'User', required: true, unique: true },
    username: { type: String, required: true },
    accessTokenEnc: { type: String, required: true },
    scopes: { type: [String], default: [] },
    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

export const GithubAccount: any = (mongoose.models as Record<string, any>).GithubAccount ?? model('GithubAccount', githubAccountSchema);

/** Atomic per-project-per-kind sequence counters used for task/issue keys (e.g. DEV-1). */
const counterSchema = new Schema({
  key: { type: String, required: true, unique: true }, // `${projectId}:task` | `${projectId}:issue`
  seq: { type: Number, default: 0 },
});

export const Counter: any = (mongoose.models as Record<string, any>).Counter ?? model('Counter', counterSchema);

export async function nextSeq(projectId: mongoose.Types.ObjectId | string, kind: 'task' | 'issue'): Promise<number> {
  const key = `${String(projectId)}:${kind}`;
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return doc?.seq ?? 1;
}
