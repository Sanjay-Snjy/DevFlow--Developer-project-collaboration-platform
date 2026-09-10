import type { Types } from 'mongoose';
import type { WorkspaceRole } from '../constants/index.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        name: string;
        username: string;
        email: string;
        avatarUrl?: string;
        notificationPrefs?: Record<string, boolean>;
      };
      /** Workspace membership resolved by requireWorkspaceMember middleware. */
      workspaceRole?: WorkspaceRole;
      /** Resolved workspace member role for the route's project's workspace. */
      projectRole?: WorkspaceRole;
      /** Populated after requireWorkspace / requireProject: the docs themselves. */
      workspaceDoc?: Record<string, any> & { id: string };
      projectDoc?: Record<string, any> & { id: string };
      projectMember?: boolean;
      githubUserId?: string;
    }
  }
}

export {};
