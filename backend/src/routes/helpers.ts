import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { ApiError } from '../utils/errors.js';

/** Serializes a user document via the schema's toJSON transform. */
export async function publicUser(userId: string | null) {
  if (!userId) return null;
  const user = await User.findById(userId).select('-passwordHash');
  return user ? user.toJSON() : null;
}

/** Minimal member DTO for populates. */
export const memberSelect = 'name username email avatarUrl skills githubUsername bio';

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  description: string;
  role: string;
  ownerId: string;
  demo: boolean;
};

/** The user's profile + every workspace they belong to with their role (used by /auth/me etc). */
export async function buildAuthData(userId: string) {
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const workspaces = await Workspace.find({ 'members.user': userId })
    .select('name slug logoUrl description owner members demo')
    .lean();

  const list: WorkspaceSummary[] = workspaces.map((w) => {
    const member = w.members.find((m) => String(m.user) === userId);
    return {
      id: String(w._id),
      name: w.name,
      slug: w.slug,
      logoUrl: w.logoUrl ?? '',
      description: w.description ?? '',
      role: member?.role ?? 'VIEWER',
      ownerId: String(w.owner),
      demo: Boolean(w.demo),
    };
  });

  return { user: user.toJSON(), workspaces: list };
}
