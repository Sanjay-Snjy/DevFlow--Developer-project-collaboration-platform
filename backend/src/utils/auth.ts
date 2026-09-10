import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const TOKEN_COOKIE = 'df_token';
export const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Signs a JWT carrying the user's current tokenVersion so sessions can be revoked. */
export function signToken(userId: string, version = 0): string {
  return jwt.sign({ sub: userId, ver: version }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: 'devflow',
    audience: 'devflow-web',
  });
}

export function verifyToken(token: string): { sub: string; ver?: number } | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { issuer: 'devflow', audience: 'devflow-web' });
    if (typeof payload === 'object' && payload && typeof payload.sub === 'string') {
      return { sub: payload.sub, ver: (payload as { ver?: number }).ver ?? 0 };
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads a bearer token from the Authorization header or the auth cookie. */
export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[TOKEN_COOKIE];
  return cookie ?? null;
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    domain: env.cookieDomain || undefined,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(TOKEN_COOKIE, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    domain: env.cookieDomain || undefined,
    path: '/',
  });
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomState(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** @returns a display-safe email with the domain kept (e.g. jo***@acme.com). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const head = user.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}
