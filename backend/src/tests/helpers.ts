import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type TestCtx = { base: string; token: string; userId?: string; me?: any };

/**
 * Issues a fake-but-structurally-valid Clerk identity token understood by the API when
 * AUTH_TEST_MODE=true (see utils/clerkAuth.ts → fakeIdentityFromToken).
 */
export function testToken(email: string, name: string, username?: string): string {
  const payload = Buffer.from(JSON.stringify({ email, name, username })).toString('base64url');
  return `dev_test_${payload}`;
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
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
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

/**
 * "Registers" a user by presenting their test token to /api/auth/me, which provisions the
 * local user + personal workspace on first sight (mirrors the Clerk first-sign-in flow).
 */
export async function register(ctx: TestCtx, name: string, username: string, email: string, _password: string) {
  ctx.token = testToken(email, name, username);
  const res = await refreshMe(ctx);
  if (res.status >= 400) throw new Error(`register failed ${res.status}: ${JSON.stringify(res.body)}`);
  const user = res.body?.data?.user;
  if (user) {
    ctx.userId = user.id;
    ctx.me = res.body.data;
  }
  return res;
}
