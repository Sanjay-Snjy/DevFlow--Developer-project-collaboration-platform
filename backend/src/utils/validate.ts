import type { Request } from 'express';
import type { z } from 'zod';
import { ApiError } from './errors.js';

export type AnyZod = z.ZodTypeAny;

export function parseBody<T extends AnyZod>(req: Request, schema: T): z.infer<T> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Invalid request data', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export function parseQuery<T extends AnyZod>(req: Request, schema: T): z.infer<T> {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Invalid query parameters', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export function parseParams<T extends AnyZod>(req: Request, schema: T): z.infer<T> {
  const result = schema.safeParse(req.params ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Invalid URL parameters');
  }
  return result.data;
}

/** Escapes a user query so it is safe to embed in a RegExp for search. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
