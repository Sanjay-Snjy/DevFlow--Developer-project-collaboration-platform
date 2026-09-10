import mongoose from 'mongoose';
import type { InferSchemaType } from 'mongoose';
const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]{2,24}$/,
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String, default: '', maxlength: 1000 },
    bio: { type: String, default: '', maxlength: 600 },
    skills: { type: [String], default: [] },
    githubUsername: { type: String, default: '' },
    tokenVersion: { type: Number, default: 0, select: false },
    notificationPrefs: {
      taskAssigned: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      projectActivity: { type: Boolean, default: true },
      githubActivity: { type: Boolean, default: true },
      aiNotifications: { type: Boolean, default: true },
    },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);


export type UserDoc = InferSchemaType<typeof userSchema> & { _id: unknown };

export function jsonTransform(_doc: any, ret: Record<string, any>) {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  delete ret.passwordHash;
  return ret;
}

export const User: any = (mongoose.models as Record<string, any>).User ?? model('User', userSchema);
export type UserRecord = any;
