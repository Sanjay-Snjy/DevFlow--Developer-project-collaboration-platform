import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { authenticateClerkRequest } from '../utils/clerkAuth.js';
import { env } from '../config/env.js';

/** Verifies the Clerk session token and attaches the local user. Runs a DB lookup so revoked/deleted users are rejected. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw ApiError.unauthorized('No authentication token provided');
  if (!env.clerkSecretKey && !env.authTestMode) throw ApiError.serviceUnavailable('CLERK_SECRET_KEY is not configured on the server', 'AUTH_NOT_CONFIGURED');
  const userId = await authenticateClerkRequest(req);
  if (!userId) throw ApiError.unauthorized('Invalid or expired session — please sign in again');

  const user = await User.findById(userId)
    .select('name username email avatarUrl bio skills githubUsername notificationPrefs')
    .lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  req.userId = String(user._id);
  req.user = {
    id: String(user._id),
    name: user.name,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl ?? '',
    notificationPrefs: user.notificationPrefs as Record<string, boolean>,
  };
  next();
});

/** Optional auth: attaches user when a valid session exists but does not fail otherwise. */
export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const userId = await authenticateClerkRequest(req);
  if (!userId) return next();
  const user = await User.findById(userId).select('name username email avatarUrl').lean();
  if (!user) return next();
  req.userId = String(user._id);
  req.user = { id: String(user._id), name: user.name, username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? '' };
  next();
});
