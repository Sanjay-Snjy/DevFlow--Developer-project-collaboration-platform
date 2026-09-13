import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';
import { User } from '../models/User.js';

/**
 * Clerk authentication for the DevFlow API.
 *
 * The web app sends the Clerk session JWT as `Authorization: Bearer <token>`.
 * We verify it against Clerk's JWKS and resolve the caller to a local Mongo
 * `User` — creating one on first sight (so workspaces/roles keep working) —
 * without storing any password material. Passwords, MFA and social logins are
 * owned entirely by Clerk.
 */

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function getClerkClient() {
  if (!clerkClient) {
    if (!env.clerkSecretKey) {
      throw ApiError.serviceUnavailable('Authentication is not configured (CLERK_SECRET_KEY missing)', 'AUTH_NOT_CONFIGURED');
    }
    clerkClient = createClerkClient({ secretKey: env.clerkSecretKey });
  }
  return clerkClient;
}

export type ClerkIdentity = {
  clerkUserId: string;
  email: string;
  name: string;
  imageUrl: string;
  username: string | null;
};

/** Extract a bearer token from the Authorization header. */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return null;
}

/** Verify a Clerk session JWT (or accept a fake token when AUTH_TEST_MODE is on). */
export async function verifyClerkToken(token: string): Promise<ClerkIdentity | null> {
  if (env.authTestMode && token.startsWith('dev_test_')) {
    return fakeIdentityFromToken(token);
  }

  if (!env.clerkSecretKey) {
    console.error('[auth] CLERK_SECRET_KEY is not set — cannot verify tokens. Add it to backend/.env');
    return null;
  }

  try {
    const payload = await verifyToken(token, { secretKey: env.clerkSecretKey });
    if (!payload?.sub) return null;

    // Verify the session is still active server-side (revocation-aware).
    const client = getClerkClient();
    const session = await client.sessions.getSession(payload.sid as string);
    if (!session || session.status !== 'active') return null;

    const user = await client.users.getUser(payload.sub);
    const primaryEmailId = user.primaryEmailAddressId;
    const primary = user.emailAddresses.find((e) => e.id === primaryEmailId) ?? user.emailAddresses[0];
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

    return {
      clerkUserId: user.id,
      email: primary?.emailAddress ?? `${user.username ?? 'user'}@users.noreply.clerk.dev`,
      name: fullName || user.username || primary?.emailAddress.split('@')[0] || 'DevFlow User',
      imageUrl: user.imageUrl ?? '',
      username: user.username ?? null,
    };
  } catch (err: any) {
    console.error('[auth] Clerk token verification failed:', err?.message ?? err);
    return null;
  }
}

function fakeIdentityFromToken(token: string): ClerkIdentity | null {
  // Format: dev_test_<base64url(json)> — produced only by test helpers.
  const encoded = token.slice('dev_test_'.length);
  let payload: { email?: string; name?: string; username?: string } | null = null;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const email = typeof payload?.email === 'string' ? payload.email.toLowerCase() : null;
  if (!email) return null;
  return {
    clerkUserId: `user_test_${Buffer.from(email).toString('hex').slice(0, 24)}`,
    email,
    name: payload?.name ?? email.split('@')[0],
    imageUrl: '',
    username: payload?.username ?? null,
  };
}

/** True when the user record was created by this request's provisioning step. */
export async function resolveLocalUser(identity: ClerkIdentity): Promise<{ user: any; created: boolean }> {
  const existing = await User.findOne({ clerkUserId: identity.clerkUserId });
  if (existing) {
    // Keep the local profile in sync with Clerk on every session.
    const changes: Record<string, unknown> = {};
    if (existing.email !== identity.email) changes.email = identity.email;
    if (identity.name && existing.name !== identity.name) changes.name = identity.name;
    if ((existing.avatarUrl ?? '') !== identity.imageUrl) changes.avatarUrl = identity.imageUrl;
    if (Object.keys(changes).length) await User.updateOne({ _id: existing._id }, changes);
    return { user: existing, created: false };
  }

  // Migrate legacy accounts that existed before Clerk (match on verified email).
  const legacy = await User.findOne({ email: identity.email });
  if (legacy && !legacy.clerkUserId) {
    await User.updateOne({ _id: legacy._id }, { clerkUserId: identity.clerkUserId, avatarUrl: identity.imageUrl || legacy.avatarUrl });
    legacy.clerkUserId = identity.clerkUserId;
    return { user: legacy, created: false };
  }

  // New user — derive a unique username from Clerk data.
  const username = await uniqueUsername(identity.username ?? identity.email.split('@')[0]);

  const created = await User.create({
    clerkUserId: identity.clerkUserId,
    name: identity.name,
    username,
    email: identity.email,
    avatarUrl: identity.imageUrl,
    // Legacy column kept NOT NULL by the schema; Clerk never uses it.
    passwordHash: `!clerk:${identity.clerkUserId}`,
    tokenVersion: 0,
  });
  return { user: created, created: true };
}

/** Ensure the freshly created user gets a personal workspace, mirroring old register behavior. */
export async function provisionUserWorkspace(userId: string, name: string, username: string) {
  const { Workspace } = await import('../models/Workspace.js');
  const exists = await Workspace.findOne({ 'members.user': userId }).select('_id').lean();
  if (exists) return;

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';
  const root = slugify(username);
  let slug = root;
  for (let i = 0; i < 20; i++) {
    const hit = await Workspace.findOne({ slug }).select('_id').lean();
    if (!hit) break;
    slug = i === 0 ? `${root}-${Date.now().toString(36).slice(-4)}` : `${root}-${i + 1}`;
  }

  await Workspace.create({
    name: `${name.split(' ')[0]}'s Workspace`,
    slug,
    description: 'Personal workspace',
    owner: userId,
    members: [{ user: userId, role: 'OWNER' }],
  });
}

async function uniqueUsername(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user';
  if (!(await User.findOne({ username: clean }).select('_id').lean())) return clean;
  for (let i = 1; i < 50; i++) {
    const candidate = `${clean}${i}`;
    if (!(await User.findOne({ username: candidate }).select('_id').lean())) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

/** Shared guard used by requireAuth/optionalAuth and the Socket.IO handshake. */
export async function authenticateClerkRequest(req: Request): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const identity = await verifyClerkToken(token);
  if (!identity) return null;
  const { user } = await resolveLocalUser(identity);
  return String(user._id);
}
