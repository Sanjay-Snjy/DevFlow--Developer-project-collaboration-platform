import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
  static tooMany(message = 'Too many requests, please slow down') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
  static serviceUnavailable(message: string, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, code, message);
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  // Mongoose errors
  const e = err as { name?: string; code?: number; message?: string; keyValue?: Record<string, unknown> };
  if (e.name === 'CastError') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid resource identifier' } });
    return;
  }
  if (e.code === 11000) {
    const field = Object.keys(e.keyValue ?? {})[0] ?? 'value';
    res.status(409).json({ error: { code: 'DUPLICATE', message: `A record with that ${field} already exists` } });
    return;
  }
  if (e.name === 'ValidationError') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: e.message } });
    return;
  }
  const status = process.env.NODE_ENV === 'production' ? 500 : 500;
  // eslint-disable-next-line no-console
  console.error('[error]', e);
  res.status(status).json({
    error: {
      code: 'INTERNAL',
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong on the server' : e.message,
    },
  });
}

/** Standard success envelope: { data: ... } */
export function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ data });
}
