/** Thin fetch wrapper. Same-origin by default (Next.js proxies /api → Node API).
 *  When NEXT_PUBLIC_API_URL is set (e.g. http://localhost:4000) requests go cross-origin.
 *  Either way the Node API lives under /api, which is added here so callers only pass
 *  route paths (e.g. "/auth/me").
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const API_PREFIX = '/api';

export type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, { ...init, headers, credentials: 'include' });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty / non-json */
  }

  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'REQUEST_FAILED', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return (body as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

export const swrFetcher = <T>(path: string): Promise<T> => api.get<T>(path);

/** Query string builder that skips empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length ? `?${entries.join('&')}` : '';
}
