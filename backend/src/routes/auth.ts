import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { clearAuthCookie, extractToken, hashPassword, setAuthCookie, signToken, verifyPassword, verifyToken } from '../utils/auth.js';
import { parseBody } from '../utils/validate.js';
import { buildAuthData } from './helpers.js';
import { authLimiter } from '../middleware/security.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  username: z.string().trim().regex(/^[a-z0-9_]{2,24}$/, 'Username: 2-24 chars, lowercase letters, numbers, underscores'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, registerSchema);
    const existing = await User.findOne({ $or: [{ email: body.email }, { username: body.username }] }).select('email username').lean();
    if (existing) {
      if (existing.email === body.email) throw ApiError.conflict('An account with this email already exists');
      throw ApiError.conflict('That username is already taken');
    }

    const passwordHash = await hashPassword(body.password);
    const user = await User.create({ ...body, passwordHash });

    // Give every new user a personal workspace so the product is usable immediately.
    const slug = await uniqueSlug(user.username);
    const workspace = await Workspace.create({
      name: `${user.name.split(' ')[0]}'s Workspace`,
      slug,
      description: 'Personal workspace',
      owner: user._id,
      members: [{ user: user._id, role: 'OWNER' }],
    });

    const token = signToken(String(user._id), user.tokenVersion ?? 0);
    setAuthCookie(res, token);
    ok(res, await buildAuthData(String(user._id)), 201);
  })
);

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(200),
  password: z.string().min(1, 'Password is required').max(200),
});

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, password } = parseBody(req, loginSchema);
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
    }).select('+passwordHash +tokenVersion');
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw ApiError.unauthorized('Invalid email/username or password');
    }
    const token = signToken(String(user._id), user.tokenVersion ?? 0);
    setAuthCookie(res, token);
    ok(res, await buildAuthData(String(user._id)));
  })
);

router.post('/logout', asyncHandler(async (req, res) => {
  // Revoke the current token version server-side so an already-stolen cookie dies immediately.
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      await User.updateOne({ _id: payload.sub }, { $inc: { tokenVersion: 1 } });
    }
  }
  clearAuthCookie(res);
  ok(res, { ok: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  ok(res, await buildAuthData(req.userId!));
}));

export default router;

async function uniqueSlug(base: string): Promise<string> {
  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';
  const root = slugify(base);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const hit = await Workspace.findOne({ slug: candidate }).select('_id').lean();
    if (!hit) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
