/** Shared domain enums — the single source of truth used by models, routes and the frontend types. */

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'DEVELOPER', 'VIEWER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Roles that can mutate projects/tasks/issues at a managerial level. */
export const MANAGE_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'MANAGER'];
/** Roles that may administer the workspace itself. */
export const ADMIN_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN'];

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

export const INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const SUBJECT_TYPES = ['task', 'issue'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'task_assigned',
  'issue_assigned',
  'mention',
  'task_status',
  'comment',
  'member_added',
  'project_added',
  'workspace_invite',
  'github_activity',
  'ai_complete',
  'system',
] as const;

export const ACTIVITY_TYPES = [
  'workspace.created',
  'member.joined',
  'member.removed',
  'member.role_changed',
  'project.created',
  'project.updated',
  'project.archived',
  'task.created',
  'task.updated',
  'task.moved',
  'task.assigned',
  'task.deleted',
  'issue.created',
  'issue.updated',
  'issue.deleted',
  'comment.added',
  'comment.deleted',
  'sprint.created',
  'sprint.updated',
  'github.linked',
  'github.unlinked',
] as const;
