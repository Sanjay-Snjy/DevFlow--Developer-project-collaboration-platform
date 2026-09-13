import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import { api, register, startTestServer, type TestCtx } from './helpers';

const MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/devflow_test';
process.env.MONGODB_URI = MONGODB_URI;
process.env.AUTH_TEST_MODE = 'true';

let server: Awaited<ReturnType<typeof startTestServer>>['server'];
const owner: TestCtx = { base: '', token: '' };
const dev: TestCtx = { base: '', token: '' };
let workspaceId = '';
let projectId = '';
let taskId = '';
let commentId = '';

before(async () => {
  await connectDb(MONGODB_URI);
  await mongoose.connection.dropDatabase();
  const started = await startTestServer();
  server = started.server;
  owner.base = started.base;
  dev.base = started.base;

  await register(owner, 'Owner Test', 'ownertest', 'owner@comments.test', 'Sup3rSecret!');
  const wsRes = await api(owner, '/api/workspaces', {
    method: 'POST',
    json: { name: 'Comments Team', slug: 'comments-team' },
  });
  workspaceId = wsRes.body.data.id;

  await register(dev, 'Dev Test', 'devtest', 'dev@comments.test', 'Sup3rSecret!');
  const addDev = await api(owner, `/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    json: { email: 'dev@comments.test', role: 'DEVELOPER' },
  });
  assert.equal(addDev.status, 201);

  const proj = await api(owner, '/api/projects', {
    method: 'POST',
    json: { workspaceId, key: 'CMT', name: 'Comments Project' },
  });
  projectId = proj.body.data.id;
  const addToProject = await api(owner, `/api/projects/${projectId}/members`, {
    method: 'POST',
    json: { userIds: [dev.userId!] },
  });
  assert.equal(addToProject.status, 200);

  const task = await api(owner, `/api/projects/${projectId}/tasks`, {
    method: 'POST',
    json: { title: 'Comment lifecycle task' },
  });
  taskId = task.body.data.id;
});

after(async () => {
  server?.close();
  await disconnectDb();
});

describe('comments — full lifecycle', () => {
  it('author can edit their own comment via /api/comments/:id', async () => {
    const created = await api(dev, `/api/tasks/${taskId}/comments`, {
      method: 'POST',
      json: { content: 'original text @ownertest' },
    });
    assert.equal(created.status, 201);
    commentId = created.body.data.id;

    const edited = await api(dev, `/api/comments/${commentId}`, {
      method: 'PATCH',
      json: { content: 'edited text' },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.content, 'edited text');
  });

  it('someone else cannot edit the comment', async () => {
    const denied = await api(owner, `/api/comments/${commentId}`, {
      method: 'PATCH',
      json: { content: 'hijacked' },
    });
    assert.equal(denied.status, 403);
  });

  it('a workspace manager/owner can delete others’ comments', async () => {
    const deleted = await api(owner, `/api/comments/${commentId}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    const list = await api(owner, `/api/tasks/${taskId}/comments`);
    assert.equal(list.body.data.length, 0);
  });

  it('a plain member cannot delete a comment they did not author', async () => {
    const created = await api(owner, `/api/tasks/${taskId}/comments`, {
      method: 'POST',
      json: { content: 'owned by owner' },
    });
    const other = created.body.data.id;
    const denied = await api(dev, `/api/comments/${other}`, { method: 'DELETE' });
    assert.equal(denied.status, 403);
  });
});
