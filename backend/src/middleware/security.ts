import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Explicit allow-list. In production only CORS_ORIGINS is honored; the localhost
// defaults exist purely so a fresh dev checkout works before CORS_ORIGINS is set.
const ALLOWED = new Set([
  ...env.corsOrigins,
  ...(env.isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3002', 'http://127.0.0.1:3002']),
]);

/**
 * CSRF defence for state-changing requests. Sessions ride in a SameSite=Lax cookie and CORS
 * blocks cross-origin JSON reads/writes; this additionally rejects any browser request whose
 * Origin header is not an explicitly allowed origin. Non-browser clients (curl, tests) omit
 * the Origin header and pass through.
 */
export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (origin && !ALLOWED.has(origin)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Request origin is not allowed' } });
    return;
  }
  next();
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'AI rate limit reached, try again shortly' } },
});

export const githubLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'GitHub rate limit reached, try again shortly' } },
});
