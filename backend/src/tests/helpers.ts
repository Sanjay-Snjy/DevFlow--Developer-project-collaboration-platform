import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type TestCtx = { base: string; cookie: string; userId?: string; me?: any };

export function parseSetCookie(headers: Headers): string {
  const raw = headers.getSetCookie?.() ?? [];
  const setCookie = raw[0] ?? headers.get('set-cookie') ?? '';
  const token = setCookie.split(';')[0]; // df_token=...
  return token;
}

export async function refreshMe(ctx: TestCtx) {
  const res = await api(ctx, '/api/auth/me');
  if (res.body?.data?.user?.id) {
    ctx.userId = res.body.data.user.id;
    ctx.me = res.body.data;
  }
  return res;
}

export async function api(ctx: TestCtx, path: string, options: RequestInit & { json?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (ctx.cookie) headers.Cookie = ctx.cookie;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ctx.base}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: body as any, headers: res.headers };
}

export async function startTestServer(): Promise<{ server: Server; base: string }> {
  const { createApp } = await import('../app');
  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

export async function register(ctx: TestCtx, name: string, username: string, email: string, password: string) {
  const res = await api(ctx, '/api/auth/register', {
    method: 'POST',
    json: { name, username, email, password },
  });
  if (res.status >= 400) throw new Error(`register failed ${res.status}: ${JSON.stringify(res.body)}`);
  ctx.cookie = parseSetCookie(res.headers);
  const user = res.body?.data?.user;
  if (user) {
    ctx.userId = user.id;
    ctx.me = res.body.data;
  }
  return res;
}
