import { Router } from 'express';
import authRouter from './auth.js';
import meRouter from './me.js';
import workspacesRouter from './workspaces.js';
import invitationsRouter from './invitations.js';
import projectsRouter from './projects.js';
import tasksItemRouter, { collectionRouter as tasksCollectionRouter } from './tasks.js';
import issuesItemRouter, { collectionRouter as issuesCollectionRouter } from './issues.js';
import commentsRouter from './comments.js';
import sprintsRouter from './sprints.js';
import activityRouter from './activity.js';
import notificationsRouter from './notifications.js';
import searchRouter from './search.js';
import analyticsRouter from './analytics.js';
import dashboardRouter from './dashboard.js';
import githubRouter from './github.js';
import aiRouter from './ai.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);

apiRouter.use('/workspaces', workspacesRouter);
apiRouter.use('/invitations', invitationsRouter);

apiRouter.use('/projects', projectsRouter);
apiRouter.use(tasksCollectionRouter); // /projects/:projectId/tasks[…]
apiRouter.use(issuesCollectionRouter); // /projects/:projectId/issues
apiRouter.use('/tasks', tasksItemRouter);
apiRouter.use('/issues', issuesItemRouter);

// Bare full-path routers (comment subject routes, sprints, activity, search, analytics, dashboard)
apiRouter.use(commentsRouter);
apiRouter.use(sprintsRouter);
apiRouter.use(activityRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use(searchRouter);
apiRouter.use(analyticsRouter);
apiRouter.use(dashboardRouter);

apiRouter.use('/github', githubRouter);
apiRouter.use('/ai', aiRouter);
