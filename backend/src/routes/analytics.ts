import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Workspace } from '../models/Workspace.js';
import { Project } from '../models/Project.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { hasWorkspaceRole } from '../middleware/access.js';
import { ADMIN_ROLES } from '../constants/index.js';
import { projectAnalytics, workspaceAnalytics } from '../services/analyticsService.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/projects/:projectId/analytics',
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.projectId);
    if (!project) throw ApiError.notFound('Project not found');
    const ws = await Workspace.findById(project.workspace).select('members').lean();
    const role = ws ? hasWorkspaceRole(ws as never, req.userId!) : null;
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    const isAdmin = role && ADMIN_ROLES.includes(role);
    const members = (project.members ?? []).map(String);
    if (!members.includes(req.userId!) && !isAdmin) throw ApiError.forbidden('You are not a member of this project');
    ok(res, await projectAnalytics(req.params.projectId));
  })
);

router.get(
  '/workspaces/:workspaceId/analytics',
  asyncHandler(async (req, res) => {
    const ws = await Workspace.findById(req.params.workspaceId);
    if (!ws) throw ApiError.notFound('Workspace not found');
    const role = hasWorkspaceRole(ws, req.userId!);
    if (!role) throw ApiError.forbidden('You are not a member of this workspace');
    ok(res, await workspaceAnalytics(req.params.workspaceId, req.userId!, role));
  })
);

export default router;
