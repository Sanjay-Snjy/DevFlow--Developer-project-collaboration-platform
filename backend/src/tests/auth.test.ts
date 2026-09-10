import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from '../config/db';
import { api, parseSetCookie, register, startTestServer, type TestCtx } from './helpers';

const MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/devflow_test';
process.env.MONGODB_URI = MONGODB_URI;

let server: Awaited<ReturnType<typeof startTestServer>>['server'];
const ctx: TestCtx = { base: '', cookie: '' };

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
  it('rejects register with a weak password and invalid username', async () => {
    const res = await api(ctx, '/api/auth/register', {
      method: 'POST',
      json: { name: 'Test', username: 'Bad Name!', email: 't1@devflow.test', password: 'short' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
  });

  it('registers a user, sets an httpOnly cookie and returns workspaces', async () => {
    const res = await api(ctx, '/api/auth/register', {
      method: 'POST',
      json: { name: 'Ada Lovelace', username: 'ada', email: 'ada@devflow.test', password: 'Sup3rSecret!' },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.user.id);
    assert.equal(res.body.data.user.email, 'ada@devflow.test');
    assert.equal(res.body.data.workspaces.length, 1);
    assert.equal(res.body.data.workspaces[0].role, 'OWNER');
    assert.ok(res.headers.get('set-cookie')?.includes('HttpOnly'));
    ctx.cookie = res.headers.get('set-cookie')!.split(';')[0];
  });

  it('rejects duplicate emails and usernames', async () => {
    const dupEmail = await api(ctx, '/api/auth/register', {
      method: 'POST',
      json: { name: 'Ada Two', username: 'ada2', email: 'ada@devflow.test', password: 'Sup3rSecret!' },
    });
    assert.equal(dupEmail.status, 409);
    const dupUser = await api(ctx, '/api/auth/register', {
      method: 'POST',
      json: { name: 'Ada Three', username: 'ada', email: 'ada3@devflow.test', password: 'Sup3rSecret!' },
    });
    assert.equal(dupUser.status, 409);
  });

  it('never exposes the password hash', async () => {
    const res = await api(ctx, '/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.passwordHash, undefined);
  });

  it('logs in with email or username and rejects bad passwords', async () => {
    const bad = await api(ctx, '/api/auth/login', { method: 'POST', json: { identifier: 'ada@devflow.test', password: 'wrongpass' } });
    assert.equal(bad.status, 401);
    const byEmail = await api(ctx, '/api/auth/login', { method: 'POST', json: { identifier: 'ada@devflow.test', password: 'Sup3rSecret!' } });
    assert.equal(byEmail.status, 200);
    const byName = await api(ctx, '/api/auth/login', { method: 'POST', json: { identifier: 'ada', password: 'Sup3rSecret!' } });
    assert.equal(byName.status, 200);
  });

  it('requires auth on protected routes', async () => {
    const anon: TestCtx = { base: ctx.base, cookie: '' };
    const res = await api(anon, '/api/auth/me');
    assert.equal(res.status, 401);
    const workspaces = await api(anon, '/api/workspaces');
    assert.equal(workspaces.status, 401);
  });

  it('logs out and invalidates the session cookie', async () => {
    const res = await api(ctx, '/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 200);
    const me = await api(ctx, '/api/auth/me');
    assert.equal(me.status, 401);
    // login again for later suites
    await register(ctx, 'Ada Lovelace', 'ada2', 'ada2@devflow.test', 'Sup3rSecret!');
  });

  it('changing password revokes old sessions and keeps current session valid', async () => {
    const oldCookie = ctx.cookie;
    const changeRes = await api(ctx, '/api/me/password', {
      method: 'POST',
      json: { currentPassword: 'Sup3rSecret!', newPassword: 'BrandNewPassword123!' },
    });
    assert.equal(changeRes.status, 200);
    const newCookie = parseSetCookie(changeRes.headers);
    assert.ok(newCookie);

    // Old cookie should now be rejected because tokenVersion incremented
    const oldCheck = await api({ base: ctx.base, cookie: oldCookie }, '/api/auth/me');
    assert.equal(oldCheck.status, 401);

    // New cookie should succeed
    const newCheck = await api({ base: ctx.base, cookie: newCookie }, '/api/auth/me');
    assert.equal(newCheck.status, 200);

    ctx.cookie = newCookie;
  });
});
