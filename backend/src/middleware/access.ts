import type { NextFunction, Request, Response } from 'express';
import { ADMIN_ROLES, MANAGE_ROLES, type WorkspaceRole } from '../constants/index.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { ApiError, asyncHandler } from '../utils/errors.js';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

export const hasWorkspaceRole = (ws: any, userId: string): WorkspaceRole | null => {
  const member = (ws?.members ?? []).find((m: any) => String(m.user) === String(userId));
  return member?.role ?? null;
};

export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  const rank: Record<WorkspaceRole, number> = { VIEWER: 0, DEVELOPER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };
  return rank[role] >= rank[minimum];
}

/** Resolves and attaches workspaceDoc + workspaceRole from a :workspaceId route param or req.body.workspaceId. */
export function resolveWorkspace(source: 'params' | 'body' = 'params'): Handler {
  return asyncHandler(async (req, _res, next) => {
    const id = source === 'params' ? req.params.workspaceId : (req.body?.workspaceId ?? req.params.workspaceId);
    if (!id) throw ApiError.badRequest('workspaceId is required');
    const workspace = await Workspace.findById(id);
    if (!workspace) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(workspace, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    req.workspaceDoc = workspace as any;
    req.workspaceRole = role;
    next();
  });
}

/**
 * Requires the caller to hold one of the given workspace roles. Combine with resolveWorkspace
 * (or resolveProject, which resolves the workspace role of the project's workspace).
 */
export function requireWorkspaceRole(roles: WorkspaceRole[]): Handler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const role = (_req as Request & { workspaceRole?: WorkspaceRole }).workspaceRole;
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    if (!roles.includes(role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: `Requires workspace role: ${roles.join(' or ')}` } });
      return;
    }
    next();
  };
}

/**
 * Loads the project from :id, resolves the caller's workspace role, and enforces
 * project membership (workspace OWNER/ADMIN always pass).
 */
export function resolveProject(options: { param?: string; roleParam?: string } = {}): Handler {
  return asyncHandler(async (req, _res, next) => {
    const id = options.param ? req.params[options.param] : req.params.id;
    if (!id) throw ApiError.badRequest('Project id is required');
    const project = await Project.findById(id);
    if (!project) throw ApiError.notFound('Project not found');
    if (project.archivedAt && req.method !== 'GET') {
      // Archived projects are read-only
      throw ApiError.forbidden('This project is archived');
    }
    const workspace = await Workspace.findById(project.workspace);
    if (!workspace) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(workspace, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');

    const memberIds = (project.members ?? []).map((m) => String(m));
    const isMember = memberIds.includes(String(req.userId));
    const admin = ADMIN_ROLES.includes(role);
    if (!isMember && !admin) throw ApiError.forbidden('You are not a member of this project');

    req.projectDoc = project as any;
    req.workspaceDoc = workspace as any;
    req.workspaceRole = role;
    req.projectRole = role;
    req.projectMember = isMember;
    next();
  });
}

/** Convenience chain helpers used by routers. */
export const access = {
  /** [auth, ws role gate] workspace-scoped manager-or-above route. */
  wsManage: (source: 'params' | 'body' = 'params') => [resolveWorkspace(source), requireWorkspaceRole(MANAGE_ROLES)] as Handler[],
  /** [auth, ws role gate] workspace admin-or-owner route. */
  wsAdmin: (source: 'params' | 'body' = 'params') => [resolveWorkspace(source), requireWorkspaceRole(ADMIN_ROLES)] as Handler[],
  /** [auth, ws member gate] any workspace member (read access). */
  wsMember: (source: 'params' | 'body' = 'params') => [resolveWorkspace(source)] as Handler[],
  /** [auth, project member gate] read access to a project. */
  projectMember: () => [resolveProject()] as Handler[],
  /** [auth, project member + manager-or-above] mutation on projects/tasks/issues. */
  projectManage: () => [resolveProject(), requireWorkspaceRole(MANAGE_ROLES)] as Handler[],
  /** [auth, project member + admin-or-above]. */
  projectAdmin: () => [resolveProject(), requireWorkspaceRole(ADMIN_ROLES)] as Handler[],
};
