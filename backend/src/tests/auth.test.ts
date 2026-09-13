import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from '../config/db';
import { api, register, startTestServer, testToken, type TestCtx } from './helpers';

const MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/devflow_test';
process.env.MONGODB_URI = MONGODB_URI;
process.env.AUTH_TEST_MODE = 'true';

let server: Awaited<ReturnType<typeof startTestServer>>['server'];
const ctx: TestCtx = { base: '', token: '' };

before(async () => {
  await connectDb(MONGODB_URI);
  await (await import('mongoose')).default.connection.dropDatabase();
  const started = await startTestServer();
  server = started.server;
  ctx.base = started.base;
});

after(async () => {
  server?.close();
  await disconnectDb();
});

describe('auth', () => {
  it('rejects requests without a bearer token', async () => {
    const anon: TestCtx = { base: ctx.base, token: '' };
    const res = await api(anon, '/api/auth/me');
    assert.equal(res.status, 401);
    const workspaces = await api(anon, '/api/workspaces');
    assert.equal(workspaces.status, 401);
  });

  it('rejects malformed bearer tokens', async () => {
    const bad: TestCtx = { base: ctx.base, token: 'dev_test_notvalidbase64!!' };
    const res = await api(bad, '/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('provisions a local user + personal workspace on first /auth/me', async () => {
    ctx.token = testToken('ada@devflow.test', 'Ada Lovelace', 'ada');
    const res = await api(ctx, '/api/auth/me');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.user.id);
    assert.equal(res.body.data.user.email, 'ada@devflow.test');
    assert.equal(res.body.data.workspaces.length, 1);
    assert.equal(res.body.data.workspaces[0].role, 'OWNER');
    ctx.userId = res.body.data.user.id;
  });

  it('reuses the same local user across repeated token presentations', async () => {
    const res = await api(ctx, '/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, ctx.userId);
    assert.equal(res.body.data.workspaces.length, 1);
  });

  it('never exposes the password hash', async () => {
    const res = await api(ctx, '/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.passwordHash, undefined);
  });

  it('maps the Clerk identity to a local user even when the username differs', async () => {
    // Different Clerk username, same verified email → must resolve to the same account.
    ctx.token = testToken('ada@devflow.test', 'Ada Lovelace', 'ada-clerk-name');
    const res = await api(ctx, '/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, ctx.userId);
    // Local username stays stable (not overwritten by the Clerk handle).
    assert.equal(res.body.data.user.username, 'ada');
  });

  it('keeps the token version hidden while keeping legacy tokenVersion check harmless', async () => {
    // Legacy accounts keep a tokenVersion field; it must not leak into responses.
    const res = await api(ctx, '/api/auth/me');
    assert.equal(res.body.data.user.tokenVersion, undefined);
  });
});
