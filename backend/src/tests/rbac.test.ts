import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import { api, register, startTestServer, type TestCtx } from './helpers';

const MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/devflow_test';
// Ensure config/env picks up the test URI (dotenv may have already loaded the production one).
process.env.MONGODB_URI = MONGODB_URI;
process.env.AUTH_TEST_MODE = 'true';

let server: Awaited<ReturnType<typeof startTestServer>>['server'];
const base = { base: '' };
const alice: TestCtx = { base: '', token: '' };
const bob: TestCtx = { base: '', token: '' };
const carl: TestCtx = { base: '', token: '' };

let workspaceId = '';
let projectId = '';
let taskId = '';

before(async () => {
  await connectDb(MONGODB_URI);
  await mongoose.connection.dropDatabase();
  const started = await startTestServer();
  server = started.server;
  base.base = started.base;
  alice.base = started.base;
  bob.base = started.base;
  carl.base = started.base;

  await register(alice, 'Alice Owner', 'alice', 'alice@rbac.test', 'Sup3rSecret!');
  const wsRes = await api(alice, '/api/workspaces', {
    method: 'POST',
    json: { name: 'RBAC Team', slug: 'rbac-team' },
  });
  workspaceId = wsRes.body.data.id;

  // Bob joins as DEVELOPER
  await register(bob, 'Bob Dev', 'bob', 'bob@rbac.test', 'Sup3rSecret!');
  const addBob = await api(alice, `/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    json: { email: 'bob@rbac.test', role: 'DEVELOPER' },
  });
  assert.equal(addBob.status, 201);

  const proj = await api(alice, '/api/projects', {
    method: 'POST',
    json: { workspaceId, key: 'PAY', name: 'Payments API', description: 'Test project' },
  });
  assert.equal(proj.status, 201);
  projectId = proj.body.data.id;

  // Bob must be added to the project to see it
  const addToProject = await api(alice, `/api/projects/${projectId}/members`, {
    method: 'POST',
    json: { userIds: [bob.userId!] },
  });
  assert.equal(addToProject.status, 200);
});

after(async () => {
  server?.close();
  await disconnectDb();
});

describe('RBAC + core flows', () => {
  it('OWNER can create a project; DEVELOPER cannot', async () => {
    const denied = await api(bob, '/api/projects', {
      method: 'POST',
      json: { workspaceId, key: 'X1', name: 'Nope' },
    });
    assert.equal(denied.status, 403);
  });

  it('a VIEWER-scoped user cannot create tasks (backend enforced)', async () => {
    // Vic joins as VIEWER via direct add
    const vic: TestCtx = { base: base.base, cookie: '' };
    await register(vic, 'Vic Viewer', 'vic', 'vic@rbac.test', 'Sup3rSecret!');
    const addVic = await api(alice, `/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      json: { email: 'vic@rbac.test', role: 'VIEWER' },
    });
    assert.equal(addVic.status, 201);
    const addProj = await api(alice, `/api/projects/${projectId}/members`, {
      method: 'POST',
      json: { userIds: [vic.userId!] },
    });
    assert.equal(addProj.status, 200);
    const task = await api(vic, `/api/projects/${projectId}/tasks`, {
      method: 'POST',
      json: { title: 'Should not be allowed' },
    });
    assert.equal(task.status, 403);
    const read = await api(vic, `/api/projects/${projectId}`);
    assert.equal(read.status, 200);
  });

  it('MANAGER+ can create tasks and assign them', async () => {
    const task = await api(alice, `/api/projects/${projectId}/tasks`, {
      method: 'POST',
      json: { title: 'Implement retries', description: 'Add exponential backoff', assignee: bob.userId!, priority: 'HIGH', estimatedHours: 4 },
    });
    assert.equal(task.status, 201);
    assert.match(task.body.data.key, /^PAY-\d+$/);
    taskId = task.body.data.id;
  });

  it('the assignee DEVELOPER can change status but not other fields', async () => {
    const move = await api(bob, `/api/tasks/${taskId}`, {
      method: 'PATCH',
      json: { status: 'IN_PROGRESS' },
    });
    assert.equal(move.status, 200);
    const hijack = await api(bob, `/api/tasks/${taskId}`, {
      method: 'PATCH',
      json: { title: 'Hijacked by bob' },
    });
    assert.equal(hijack.status, 403);
  });

  it('board shows the task in the right column after a move', async () => {
    const moved = await api(alice, `/api/tasks/${taskId}/move`, { method: 'POST', json: { status: 'DONE', toIndex: 0 } });
    assert.equal(moved.status, 200);
    const board = await api(bob, `/api/projects/${projectId}/tasks/board`);
    assert.equal(board.status, 200);
    const doneColumn = board.body.data.columns.find((c: any) => c.status === 'DONE');
    assert.ok(doneColumn.tasks.some((t: any) => t.id === taskId));
  });

  it('comments can be posted and mentions are resolved to workspace members', async () => {
    const comment = await api(bob, `/api/tasks/${taskId}/comments`, {
      method: 'POST',
      json: { content: '@alice please review the retry logic' },
    });
    assert.equal(comment.status, 201);
    assert.ok(comment.body.data.mentions.length === 1);
    const list = await api(alice, `/api/tasks/${taskId}/comments`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
  });

  it('a non-member cannot see a project and cannot mutate foreign tasks', async () => {
    const proj2 = await api(alice, '/api/projects', {
      method: 'POST',
      json: { workspaceId, key: 'SEC', name: 'Secret Project' },
    });
    const hidden = await api(bob, `/api/projects/${proj2.body.data.id}`);
    assert.equal(hidden.status, 403);
    const list = await api(bob, `/api/projects?workspace=${workspaceId}`);
    const keys = list.body.data.map((p: any) => p.key);
    assert.ok(!keys.includes('SEC'));
  });

  it('invitation → registration → accept grants workspace membership', async () => {
    const invite = await api(alice, `/api/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      json: { email: 'carl@rbac.test', role: 'DEVELOPER' },
    });
    assert.equal(invite.status, 201);
    await register(carl, 'Carl Invitee', 'carl', 'carl@rbac.test', 'Sup3rSecret!');
    const accept = await api(carl, '/api/invitations/accept', {
      method: 'POST',
      json: { token: invite.body.data.acceptToken },
    });
    assert.equal(accept.status, 200);
    const ws = await api(carl, `/api/workspaces/${workspaceId}`);
    assert.equal(ws.status, 200);
    assert.equal(ws.body.data.myRole, 'DEVELOPER');
  });

  it('can add multiple members to a project in batch', async () => {
    const proj2 = await api(alice, '/api/projects', {
      method: 'POST',
      json: { workspaceId, key: 'BAT', name: 'Batch Project' },
    });
    assert.equal(proj2.status, 201);
    const proj2Id = proj2.body.data.id;

    // Both bob and carl are workspace members; adding both in a single request must succeed
    const batchAdd = await api(alice, `/api/projects/${proj2Id}/members`, {
      method: 'POST',
      json: { userIds: [bob.userId!, carl.userId!] },
    });
    assert.equal(batchAdd.status, 200);
    assert.equal(batchAdd.body.data.added, 2);

    const memRes = await api(alice, `/api/projects/${proj2Id}/members`);
    assert.equal(memRes.status, 200);
    const memberIds = memRes.body.data.members.map((m: any) => m.id);
    assert.ok(memberIds.includes(bob.userId));
    assert.ok(memberIds.includes(carl.userId));
  });

  it('attachCounts accurately counts subtasks for parent tasks', async () => {
    const parentTask = await api(alice, `/api/projects/${projectId}/tasks`, {
      method: 'POST',
      json: { title: 'Parent Task With Children' },
    });
    assert.equal(parentTask.status, 201);
    const parentId = parentTask.body.data.id;

    const childTask = await api(alice, `/api/projects/${projectId}/tasks`, {
      method: 'POST',
      json: { title: 'Child Subtask', parent: parentId },
    });
    assert.equal(childTask.status, 201);

    const list = await api(alice, `/api/projects/${projectId}/tasks`);
    assert.equal(list.status, 200);
    const foundParent = list.body.data.items.find((t: any) => t.id === parentId);
    assert.ok(foundParent);
    assert.equal(foundParent.subtaskCount, 1);
  });

  it('returns consistent validation errors for malformed input', async () => {
    const bad = await api(alice, `/api/projects/${projectId}/tasks`, {
      method: 'POST',
      json: { title: '' },
    });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.details?.length > 0);
  });
});
