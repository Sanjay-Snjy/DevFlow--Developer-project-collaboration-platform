import type { IssueStatus, IssueType, Priority, ProjectStatus, Role, SprintStatus, TaskStatus } from './constants';

export type UserLite = { id: string; name: string; username: string; avatarUrl?: string };

export type MeUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  githubUsername?: string;
  createdAt?: string;
  notificationPrefs?: Record<string, boolean>;
};

export type NotificationPrefs = { taskAssigned: boolean; mentions: boolean; comments: boolean; projectActivity: boolean; githubActivity: boolean; aiNotifications: boolean };

export type WorkspaceDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string;
  ownerId: string;
  demo?: boolean;
  createdAt?: string;
  members: Member[];
  myRole: Role;
  stats: { projectCount: number; taskTotal: number; doneTotal: number; openIssues: number; invitationCount: number };
  invitationCount: number;
  settings: { defaultMemberRole: string };
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  role: Role;
  ownerId: string;
  demo?: boolean;
};

export type AuthData = { user: MeUser; workspaces: WorkspaceSummary[] };

export type Member = {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  githubUsername?: string;
  role?: Role;
  joinedAt?: string | null;
};

export type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority?: Priority;
  ownerId: string;
  startDate?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  repositories?: LinkedRepo[];
  stats: { totalTasks: number; doneTasks: number; openIssues: number; members: number };
  members: UserLite[];
};

export type LinkedRepo = {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  linkedBy?: string;
  linkedAt?: string;
};

export type ProjectDetail = {
  id: string;
  workspace: { id: string; name: string; slug: string } | null;
  key: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority?: Priority;
  owner: UserLite | null;
  members: Member[];
  startDate?: string | null;
  dueDate?: string | null;
  repositories: LinkedRepo[];
  createdAt: string;
  updatedAt: string;
  myRole: Role;
  counts: { totalTasks: number; doneTasks: number; openIssues: number };
  archivedAt?: string | null;
  activeSprint?: { id: string; name: string; endDate?: string | null } | null;
};

export type Task = {
  id: string;
  key: string;
  number: number;
  project: string;
  workspace: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: UserLite | null;
  reporter: UserLite | null;
  labels: string[];
  dueDate?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  sprint?: string | null;
  parent?: string | null;
  order?: number;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  subtaskCount?: number;
  commentCount?: number;
  watchers?: UserLite[];
  watching?: boolean;
  parentTask?: { id: string; key: string; title: string; status: TaskStatus } | null;
};

export type TaskDetail = Task & {
  subtasks: Task[];
  comments: CommentItem[];
  parentTask: Task['parentTask'];
  watchers: UserLite[];
  watching: boolean;
  myRole: Role;
};

export type Issue = {
  id: string;
  key: string;
  number: number;
  project: string;
  workspace: string;
  title: string;
  description: string;
  type: IssueType;
  priority: Priority;
  severity: string;
  status: IssueStatus;
  assignee: UserLite | null;
  reporter: UserLite | null;
  labels: string[];
  environment?: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
};

export type IssueDetail = Issue & { comments: CommentItem[]; relatedTasks: Array<{ id: string; key: string; title: string; status: TaskStatus }>; myRole: Role };

export type CommentItem = {
  id: string;
  content: string;
  author: UserLite | null;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  parentId?: string | null;
  mentions?: string[];
};

export type Sprint = {
  id: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  stats?: { total: number; done: number; blocked: number; inProgress: number; estimated: number; remainingEst: number; progress: number };
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: string | null;
  createdAt: string;
  actor: UserLite | null;
};

export type ProjectLite = { id: string; key: string; name: string };

/** A task as returned by the dashboard endpoints, where `project` is a populated object. */
export type DashTask = {
  id: string;
  key: string;
  title: string;
  status: import('./constants').TaskStatus;
  priority: import('./constants').Priority;
  dueDate?: string | null;
  estimatedHours?: number;
  overdue?: boolean;
  project?: ProjectLite | null;
  assignee?: UserLite | null;
};

export type DashboardData = {
  stats: {
    projects: number;
    tasks: number;
    openTasks: number;
    completedTasks: number;
    openIssues: number;
    members: number;
    myOpenTasks: number;
    completionRate: number;
  };
  myTasks: DashTask[];
  projects: Array<{ id: string; key: string; name: string; status: ProjectStatus; dueDate?: string | null; totalTasks: number; doneTasks: number; progress: number }>;
  deadlines: DashTask[];
  activity: ActivityItem[];
};

export type ActivityItem = {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  meta?: Record<string, unknown>;
  actor: UserLite | null;
  project?: { id: string; key: string; name: string } | null;
};

export type GithubStatus = {
  serverConfigured: boolean;
  oauthConfigured: boolean;
  account: { username: string; scopes: string[]; connectedAt: string } | null;
};

export type ProfileTask = {
  id: string;
  key: string;
  title: string;
  status: import('./constants').TaskStatus;
  priority: import('./constants').Priority;
  dueDate?: string | null;
  project?: ProjectLite | null;
};

export type UserProfile = {
  profile: Member;
  role: Role;
  stats: { assigned: number; completedTasks: number; projects: number };
  projects: Array<{ id: string; key: string; name: string; status: string }>;
  tasks: ProfileTask[];
  recentActivity: ActivityItem[];
};
