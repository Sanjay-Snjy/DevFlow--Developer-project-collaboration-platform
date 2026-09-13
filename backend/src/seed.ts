/**
 * Development seed — creates clearly-marked demo data (workspace.demo=true).
 *
 * Usage: `npm run seed`  (requires a running MongoDB).
 * Safe to run repeatedly: previously seeded demo data is removed first.
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { User } from './models/User.js';
import { Workspace } from './models/Workspace.js';
import { Invitation } from './models/Invitation.js';
import { Project } from './models/Project.js';
import { Task } from './models/Task.js';
import { Issue } from './models/Issue.js';
import { Comment } from './models/Comment.js';
import { Sprint } from './models/Sprint.js';
import { Activity } from './models/Activity.js';
import { Notification } from './models/Notification.js';
import { GithubAccount } from './models/GithubAccount.js';
import { Counter } from './models/GithubAccount.js';
import { sha256, randomToken } from './utils/auth.js';

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

type SeedUser = {
  name: string; username: string; email: string; github?: string; role: string; bio?: string; skills?: string[];
};

const USERS: SeedUser[] = [
  { name: 'Alex Chen', username: 'alex', email: 'alex@devflow.demo', github: 'alexchen-dev', role: 'OWNER', bio: 'Product engineer & founder. Building DevFlow in the open.', skills: ['TypeScript', 'Next.js', 'MongoDB'] },
  { name: 'Jordan Lee', username: 'jordan', email: 'jordan@devflow.demo', github: 'jordanlee', role: 'ADMIN', bio: 'Engineering manager. Loves clean architecture and code reviews.', skills: ['Node.js', 'Architecture', 'CI/CD'] },
  { name: 'Sam Rivera', username: 'sam', email: 'sam@devflow.demo', github: 'samrivera', role: 'DEVELOPER', bio: 'Full-stack dev. Terminal > mouse.', skills: ['React', 'Python', 'FastAPI'] },
  { name: 'Priya Patel', username: 'priya', email: 'priya@devflow.demo', github: 'priyap', role: 'DEVELOPER', bio: 'Frontend specialist with an eye for design systems.', skills: ['TypeScript', 'CSS', 'Accessibility'] },
  { name: 'Morgan Taylor', username: 'morgan', email: 'morgan@devflow.demo', role: 'VIEWER', bio: 'Product manager tracking delivery metrics.', skills: ['Product', 'Analytics'] },
];

async function main() {
  await connectDb(env.mongoUri);
  console.log('[seed] connected');

  // ── Clean previous demo data ─────────────────────────────────────
  const oldWs = await Workspace.findOne({ slug: 'nebula-labs' }).lean();
  if (oldWs) {
    const wsId = oldWs._id;
    const demoEmails = USERS.map((u) => u.email);
    const demoUsers = await User.find({ email: { $in: demoEmails } }).select('_id').lean();
    const demoIds = demoUsers.map((u) => u._id);
    await Promise.all([
      Project.find({ workspace: wsId }).lean().then(async (projects) => {
        const ids = projects.map((p) => p._id);
        await Promise.all([
          Task.deleteMany({ project: { $in: ids } }),
          Issue.deleteMany({ project: { $in: ids } }),
          Comment.deleteMany({ project: { $in: ids } }),
          Sprint.deleteMany({ project: { $in: ids } }),
          Activity.deleteMany({ project: { $in: ids } }),
        ]);
        await Project.deleteMany({ workspace: wsId });
      }),
      Invitation.deleteMany({ workspace: wsId }),
      Activity.deleteMany({ workspace: wsId }),
      Notification.deleteMany({ user: { $in: demoIds } }),
      GithubAccount.deleteMany({ user: { $in: demoIds } }),
      Workspace.deleteOne({ _id: wsId }),
      User.deleteMany({ email: { $in: demoEmails } }),
    ]);
    console.log('[seed] removed previous demo data');
  }

  // ── Users ────────────────────────────────────────────────────────
  const users: Record<string, any> = {};
  for (const u of USERS) {
    users[u.username] = await User.create({
      name: u.name, username: u.username, email: u.email,
      passwordHash: `!seed:${u.username}`,
      bio: u.bio ?? '', skills: u.skills ?? [], githubUsername: u.github ?? '', demo: true,
    });
  }
  const { alex, jordan, sam, priya, morgan } = users;

  // ── Workspace ────────────────────────────────────────────────────
  const ws = await Workspace.create({
    name: 'Nebula Labs',
    slug: 'nebula-labs',
    description: 'Demo workspace — an open-source product team building DevFlow itself.',
    owner: alex._id,
    demo: true,
    members: [
      { user: alex._id, role: 'OWNER' },
      { user: jordan._id, role: 'ADMIN' },
      { user: sam._id, role: 'DEVELOPER' },
      { user: priya._id, role: 'DEVELOPER' },
      { user: morgan._id, role: 'MANAGER' },
    ],
  });
  const wsId = ws._id;

  // ── Projects ─────────────────────────────────────────────────────
  const mkProject = async (key: string, name: string, desc: string, status: string, priority: string, owner: any, members: any[], dueInDays: number | null, startInDays = -20) => {
    const p = await Project.create({
      workspace: wsId, key, name, description: desc, status, priority, owner: owner._id,
      members: members.map((m) => m._id), startDate: new Date(now + startInDays * day), dueDate: dueInDays ? new Date(now + dueInDays * day) : null, demo: true,
    });
    await Counter.create({ key: `${String(p._id)}:task`, seq: 0 });
    await Counter.create({ key: `${String(p._id)}:issue`, seq: 0 });
    return p;
  };

  const dev = await mkProject('DEV', 'DevFlow Platform', 'The DevFlow product itself — planning, boards, realtime collaboration and integrations.', 'ACTIVE', 'HIGH', alex, [alex, jordan, sam, priya, morgan], 90);
  const mob = await mkProject('MOB', 'Mobile App', 'Companion mobile app for DevFlow (React Native).', 'ACTIVE', 'MEDIUM', jordan, [jordan, sam, priya], 45);
  const ec = await mkProject('EC', 'E-Commerce API', 'Payments & checkout microservice platform.', 'PLANNING', 'HIGH', alex, [alex, jordan, sam], null, 3);

  const ref = (m: any) => (m ? m._id : null);
  const mkTask = async (project: any, over: Partial<Record<string, any>> & { title: string }, i: { n: number }) => {
    i.n += 1;
    const completedAt = over.status === 'DONE' ? over.completedAt ?? new Date(now - 2 * day) : null;
    const t = await Task.create({
      workspace: wsId, project: project._id, number: i.n, key: `${project.key}-${i.n}`,
      labels: [], watchers: [], order: over.order ?? i.n, completedAt,
      estimatedHours: 0, ...over,
      reporter: over.reporter ?? alex._id,
      assignee: over.assignee !== undefined ? ref(over.assignee) : ref(sam),
    });
    await Counter.updateOne({ key: `${String(project._id)}:task` }, { $set: { seq: i.n } });
    return t;
  };

  const { TODO: T, IN_PROGRESS: IP, IN_REVIEW: IR, BLOCKED: B, DONE: D } = {
    TODO: 'TODO', IN_PROGRESS: 'IN_PROGRESS', IN_REVIEW: 'IN_REVIEW', BLOCKED: 'BLOCKED', DONE: 'DONE',
  };

  // ── Sprints (DEV project) ────────────────────────────────────────
  const sprintActive = await Sprint.create({
    workspace: wsId, project: dev._id, name: 'Sprint 4 · Auth & API', goal: 'Ship OAuth, finish the public API and harden permissions.',
    status: 'ACTIVE', startDate: new Date(now - 4 * day), endDate: new Date(now + 10 * day),
  });
  const sprintDone = await Sprint.create({
    workspace: wsId, project: dev._id, name: 'Sprint 3 · Realtime board', goal: 'Kanban board with drag & drop and live updates.',
    status: 'COMPLETED', startDate: new Date(now - 20 * day), endDate: new Date(now - 6 * day),
  });

  const d1 = { n: 0 };
  const devTasks: any[] = [];
  devTasks.push(await mkTask(dev, { title: 'Implement GitHub OAuth connect flow', description: 'Allow users to connect their GitHub account so repo data can be fetched with their permissions.\n\n- OAuth authorize redirect\n- token exchange + encrypted storage\n- reconnect UI in Settings', status: IP, priority: 'HIGH', assignee: sam, labels: ['authentication', 'backend'], estimatedHours: 8, sprint: sprintActive._id, dueDate: new Date(now + 4 * day) }, d1));
  devTasks.push(await mkTask(dev, { title: 'Design notification preferences model', description: 'Per-user opt-outs for assignments, mentions, comments and GitHub events.', status: D, priority: 'MEDIUM', assignee: priya, labels: ['backend', 'notifications'], estimatedHours: 4, completedAt: new Date(now - 8 * day), sprint: sprintDone._id }, d1));
  devTasks.push(await mkTask(dev, { title: 'Board drag & drop across columns', description: 'Native HTML5 DnD between TODO / IN_PROGRESS / IN_REVIEW / BLOCKED / DONE with optimistic updates.', status: D, priority: 'URGENT', assignee: sam, labels: ['frontend', 'board'], estimatedHours: 12, completedAt: new Date(now - 9 * day), sprint: sprintDone._id }, d1));
  devTasks.push(await mkTask(dev, { title: 'Fix session expiry edge cases', description: 'Users randomly getting logged out after ~1h — verify JWT sliding expiration and refresh behavior.', status: B, priority: 'URGENT', assignee: alex, labels: ['bug', 'authentication'], estimatedHours: 5, dueDate: new Date(now - 1 * day) }, d1));
  devTasks.push(await mkTask(dev, { title: 'Rate limiting for auth endpoints', description: 'Login / register brute-force protection with express-rate-limit.', status: T, priority: 'HIGH', assignee: sam, labels: ['security'], estimatedHours: 3, sprint: sprintActive._id }, d1));
  devTasks.push(await mkTask(dev, { title: 'Comment mentions with @username', description: 'Parse mentions, resolve against workspace members and deliver notifications.', status: T, priority: 'MEDIUM', assignee: priya, labels: ['frontend', 'notifications'], estimatedHours: 6, sprint: sprintActive._id, dueDate: new Date(now + 6 * day) }, d1));
  devTasks.push(await mkTask(dev, { title: 'Document public REST API', description: 'OpenAPI-style reference for tasks, issues and workspaces.', status: D, priority: 'LOW', assignee: morgan, labels: ['docs'], estimatedHours: 3, completedAt: new Date(now - 3 * day) }, d1));
  devTasks.push(await mkTask(dev, { title: 'Workspace analytics: weekly velocity', description: 'Chart completed hours per week computed from completedAt.', status: IR, priority: 'HIGH', assignee: sam, labels: ['analytics'], estimatedHours: 8, sprint: sprintActive._id, dueDate: new Date(now + 2 * day) }, d1));
  devTasks.push(await mkTask(dev, { title: 'Invite-by-email acceptance page', description: 'Public accept page for invitation tokens with email matching.', status: T, priority: 'MEDIUM', assignee: priya, labels: ['frontend'], estimatedHours: 5, sprint: sprintActive._id }, d1));
  const parent = devTasks[0];
  devTasks.push(await mkTask(dev, { title: 'Encrypt stored GitHub tokens (AES-256-GCM)', description: 'Sub-task of OAuth connect: secrets at rest.', status: T, priority: 'HIGH', assignee: sam, labels: ['security', 'authentication'], estimatedHours: 3, parent: parent._id, sprint: sprintActive._id }, d1));

  const d2 = { n: 0 };
  await mkTask(mob, { title: 'Bottom navigation for mobile layouts', status: IP, priority: 'HIGH', assignee: priya, labels: ['frontend', 'ui'], estimatedHours: 6, dueDate: new Date(now + 3 * day) }, d2);
  await mkTask(mob, { title: 'Push notifications via Expo', status: T, priority: 'MEDIUM', assignee: sam, labels: ['mobile'], estimatedHours: 10, dueDate: new Date(now + 12 * day) }, d2);
  await mkTask(mob, { title: 'Dark mode design tokens', status: D, priority: 'LOW', assignee: priya, labels: ['ui'], estimatedHours: 4, completedAt: new Date(now - 5 * day) }, d2);
  await mkTask(mob, { title: 'Offline board cache', status: B, priority: 'HIGH', assignee: sam, labels: ['mobile', 'bug'], estimatedHours: 8 }, d2);
  await mkTask(mob, { title: 'Onboarding carousel screens', status: T, priority: 'LOW', assignee: priya, labels: ['ui'], estimatedHours: 3 }, d2);

  const d3 = { n: 0 };
  await mkTask(ec, { title: 'Idempotent payment intents', status: T, priority: 'URGENT', assignee: alex, labels: ['backend', 'payments'], estimatedHours: 12, dueDate: new Date(now + 15 * day) }, d3);
  await mkTask(ec, { title: 'Webhook signature verification', status: T, priority: 'HIGH', assignee: alex, labels: ['security', 'payments'], estimatedHours: 6 }, d3);
  await mkTask(ec, { title: 'Checkout API contract draft', status: D, priority: 'MEDIUM', assignee: morgan, labels: ['docs', 'api'], estimatedHours: 4, completedAt: new Date(now - 2 * day) }, d3);

  // ── Issues ───────────────────────────────────────────────────────
  const mkIssue = async (project: any, over: any, i: { n: number }) => {
    i.n += 1;
    const resolved = ['RESOLVED', 'CLOSED'].includes(over.status);
    const it = await Issue.create({
      workspace: wsId, project: project._id, number: i.n, key: `${project.key}-${i.n}`,
      reporter: alex._id, labels: [], ...over,
      resolvedAt: resolved ? new Date(now - 2 * day) : null,
    });
    await Counter.updateOne({ key: `${String(project._id)}:issue` }, { $set: { seq: i.n } });
    return it;
  };
  const ie = { n: 0 };
  await mkIssue(dev, { title: 'Users randomly get logged out after an hour', type: 'BUG', severity: 'CRITICAL', priority: 'URGENT', status: 'OPEN', assignee: alex, reporter: sam, labels: ['bug', 'authentication'], environment: 'Production (Chrome 122)', stepsToReproduce: '1. Log in\n2. Leave tab open for ~60 minutes\n3. Perform any API request', expectedResult: 'Session stays valid while active', actualResult: '401 returned and user redirected to /login' }, ie);
  await mkIssue(dev, { title: 'Board column drop indicator flickers on fast drags', type: 'BUG', severity: 'LOW', priority: 'LOW', status: 'OPEN', assignee: priya, reporter: morgan, labels: ['frontend', 'board'] }, ie);
  await mkIssue(dev, { title: 'Support sprint velocity chart', type: 'FEATURE', severity: 'MEDIUM', priority: 'MEDIUM', status: 'RESOLVED', assignee: sam, reporter: jordan, labels: ['analytics'] }, ie);
  await mkIssue(dev, { title: 'Allow custom issue labels per project', type: 'IMPROVEMENT', severity: 'LOW', priority: 'MEDIUM', status: 'IN_PROGRESS', assignee: priya, reporter: jordan, labels: ['backend'] }, ie);
  await mkIssue(dev, { title: 'What is the planned GitHub sync frequency?', type: 'QUESTION', severity: 'LOW', priority: 'LOW', status: 'CLOSED', reporter: morgan }, ie);
  const di = { n: 0 };
  await mkIssue(mob, { title: 'Avatar images do not load offline', type: 'BUG', severity: 'HIGH', priority: 'HIGH', status: 'OPEN', assignee: sam, reporter: sam, labels: ['mobile'] }, di);
  await mkIssue(mob, { title: 'Pull-to-refresh resets board filters', type: 'BUG', severity: 'MEDIUM', priority: 'MEDIUM', status: 'IN_PROGRESS', assignee: priya, reporter: priya, labels: ['mobile', 'board'] }, di);

  // ── Comments (with a mention for @sam) ───────────────────────────
  const c1 = await Comment.create({ workspace: wsId, project: dev._id, subjectType: 'task', subjectId: devTasks[0]._id, author: jordan._id, content: 'Sam — can you also handle the token refresh fallback here? @sam please review the reconnect logic once this is up.' });
  await Comment.create({ workspace: wsId, project: dev._id, subjectType: 'task', subjectId: devTasks[0]._id, author: sam._id, content: 'On it. I will reuse the existing crypto helper for encryption.', parentId: c1._id });
  await Comment.create({ workspace: wsId, project: dev._id, subjectType: 'task', subjectId: devTasks[3]._id, author: alex._id, content: 'Reproduced — token TTL is 1h with no refresh. Moving to BLOCKED until we decide on sliding expiration.' });
  await Comment.create({ workspace: wsId, project: mob._id, subjectType: 'issue', subjectId: (await Issue.findOne({ project: mob._id, key: 'MOB-1' }))._id, author: sam._id, content: '@priya can you check whether the avatar URL uses the CDN domain? That would explain the offline failure.' });
  const c2 = await Comment.create({ workspace: wsId, project: dev._id, subjectType: 'issue', subjectId: (await Issue.findOne({ project: dev._id, key: 'DEV-1' }))._id, author: sam._id, content: 'Also worth checking cookie SameSite settings in Safari.' });
  await Comment.create({ workspace: wsId, project: dev._id, subjectType: 'issue', subjectId: (await Issue.findOne({ project: dev._id, key: 'DEV-1' }))._id, author: alex._id, content: 'Good catch — SameSite=Lax should be fine, but we never tested Safari. Adding a follow-up task.', parentId: c2._id });

  // ── Activity feed (backdated for a lively timeline) ─────────────
  const act = (type: string, actor: any, title: string, project: any, meta: any, daysAgo: number) =>
    Activity.create({ workspace: wsId, project: project?._id ?? null, actor: actor?._id ?? null, type, title, meta: meta ?? {}, createdAt: new Date(now - daysAgo * day), demo: true });
  await act('project.created', alex, 'Created project DEV “DevFlow Platform”', dev, {}, 24);
  await act('task.created', jordan, 'Created task DEV-6 “Comment mentions with @username”', dev, {}, 5);
  await act('member.joined', alex, 'Added Sam Rivera to the workspace', null, {}, 30);
  await act('task.moved', sam, 'Moved DEV-3 from TODO to DONE', dev, { from: 'TODO', to: 'DONE' }, 9);
  await act('issue.created', sam, 'Reported DEV-1 “Users randomly get logged out after an hour” (BUG)', dev, {}, 3);
  await act('sprint.created', jordan, 'Created sprint “Sprint 4 · Auth & API”', dev, {}, 4);
  await act('comment.added', alex, 'Commented on DEV-4 “Fix session expiry edge cases”', dev, {}, 1);
  await act('task.moved', priya, 'Moved MOB-3 from TODO to DONE', mob, { from: 'TODO', to: 'DONE' }, 5);

  // ── Notifications for demo (Sam gets a couple unread) ───────────
  await Notification.create({ user: sam._id, actor: jordan._id, workspace: wsId, project: dev._id, type: 'mention', title: 'Jordan Lee mentioned you in DEV-1', body: 'Sam — can you also handle the token refresh fallback here?', link: `/projects/${String(dev._id)}/issues/${String((await Issue.findOne({ project: dev._id, key: 'DEV-1' }))._id)}`, demo: true });
  await Notification.create({ user: sam._id, actor: alex._id, workspace: wsId, project: mob._id, type: 'task_assigned', title: 'You were assigned MOB-4', body: 'Offline board cache', link: `/projects/${String(mob._id)}/tasks`, demo: true });
  await Notification.create({ user: priya._id, actor: sam._id, workspace: wsId, project: mob._id, type: 'mention', title: 'Sam Rivera mentioned you in MOB-1', body: '@priya can you check whether the avatar URL uses the CDN domain?', link: `/projects/${String(mob._id)}/issues/${String((await Issue.findOne({ project: mob._id, key: 'MOB-1' }))._id)}`, demo: true, readAt: new Date(now - 1 * day) });

  // ── Pending invitation (email not yet registered) ───────────────
  const inviteToken = randomToken(24);
  await Invitation.create({
    workspace: wsId, email: 'taylor.dev@example.com', role: 'DEVELOPER', invitedBy: alex._id,
    tokenHash: sha256(inviteToken), status: 'PENDING', expiresAt: new Date(now + 7 * day), demo: true,
  });

  console.log('\n────────── DevFlow demo data seeded ──────────');
  console.log('Workspace : Nebula Labs (slug: nebula-labs)');
  console.log('Projects  : DEV, MOB, EC with tasks, issues, comments & sprints');
  console.log('\nDemo accounts are seeded as local profiles only — sign in happens through Clerk.');
  for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email.padEnd(24)} ${u.username}`);
  console.log(`\nPending invitation for taylor.dev@example.com — accept token:`);
  console.log(`  ${inviteToken}`);
  console.log('─────────────────────────────────────────────');

  await disconnectDb();
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
