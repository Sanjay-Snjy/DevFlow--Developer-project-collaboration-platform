import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { extractToken, verifyToken } from '../utils/auth.js';

/** Verifies the JWT and attaches a lightweight req.user. Runs a DB lookup so revoked/deleted users are rejected. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();
  const payload = verifyToken(token);
  if (!payload) throw ApiError.unauthorized('Session is invalid or expired');

  const user = await User.findById(payload.sub)
    .select('name username email avatarUrl bio skills githubUsername notificationPrefs +tokenVersion')
    .lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) throw ApiError.unauthorized('Session has been revoked, please sign in again');

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
  const token = extractToken(req);
  if (!token) return next();
  const payload = verifyToken(token);
  if (!payload) return next();
  const user = await User.findById(payload.sub).select('name username email avatarUrl +tokenVersion').lean();
  if (!user) return next();
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) return next();
  req.userId = String(user._id);
  req.user = { id: String(user._id), name: user.name, username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? '' };
  next();
});
