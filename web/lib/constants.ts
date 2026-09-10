export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'DEVELOPER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];
export const CAN_MANAGE = ['OWNER', 'ADMIN', 'MANAGER'] as const;
export const CAN_ADMIN = ['OWNER', 'ADMIN'] as const;

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ISSUE_TYPES = ['BUG', 'FEATURE', 'IMPROVEMENT', 'QUESTION'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const SPRINT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const PRIORITY_META: Record<Priority, { label: string; dot: string }> = {
  URGENT: { label: 'Urgent', dot: '#ef4444' },
  HIGH: { label: 'High', dot: '#f97316' },
  MEDIUM: { label: 'Medium', dot: '#eab308' },
  LOW: { label: 'Low', dot: '#64748b' },
};

export const STATUS_META: Record<TaskStatus, { label: string }> = {
  TODO: { label: 'Todo' },
  IN_PROGRESS: { label: 'In Progress' },
  IN_REVIEW: { label: 'In Review' },
  BLOCKED: { label: 'Blocked' },
  DONE: { label: 'Done' },
};

export const ISSUE_STATUS_META: Record<IssueStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const TYPE_META: Record<IssueType, string> = {
  BUG: 'Bug',
  FEATURE: 'Feature',
  IMPROVEMENT: 'Improvement',
  QUESTION: 'Question',
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  DEVELOPER: 'Developer',
  VIEWER: 'Viewer',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, DEVELOPER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export const roleAtLeast = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];

export const USERNAME_RE = /@([a-z0-9_]{2,24})/gi;
