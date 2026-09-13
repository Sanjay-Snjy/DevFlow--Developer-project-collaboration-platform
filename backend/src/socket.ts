import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { env } from './config/env.js';
import { Workspace } from './models/Workspace.js';
import { Project } from './models/Project.js';
import { extractBearerToken, verifyClerkToken, resolveLocalUser } from './utils/clerkAuth.js';

export let io: Server | null = null;

const allowedOrigins = new Set([
  ...env.corsOrigins,
  ...(env.isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3002', 'http://127.0.0.1:3002']),
]);

const cors = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

/**
 * Attaches Socket.IO to the HTTP server.
 *
 * Authentication: the client passes the Clerk session JWT in the handshake auth payload
 * (`{ token }`). Tokens are verified against Clerk's JWKS server-side; unauthenticated
 * sockets are rejected. Clients that reconnect transparently re-authenticate with a fresh
 * token.
 */
export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, { cors, path: '/socket.io' });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token;
      const token = typeof raw === 'string' && raw ? raw : null;
      const identity = token ? await verifyClerkToken(token) : null;
      if (!identity) return next(new Error('unauthorized'));

      const { user } = await resolveLocalUser(identity);

      (socket as Socket & { data: Record<string, unknown> }).data.userId = String(user._id);
      (socket as Socket & { data: Record<string, unknown> }).data.user = { id: String(user._id), name: user.name, username: user.username };
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket.data as { userId: string }).userId;

    const joinRooms = async () => {
      // personal room for direct notifications
      await socket.join(`user:${userId}`);
      // workspace rooms + admin flags so project rooms can be scoped correctly
      const memberships = await Workspace.find({ 'members.user': userId }).select('_id members').lean();
      const adminWsIds = new Set<string>();
      const joins: unknown[] = [];
      for (const w of memberships) {
        joins.push(socket.join(`workspace:${String(w._id)}`));
        const entry = w.members.find((m) => String(m.user) === userId);
        if (entry && ['OWNER', 'ADMIN'].includes(entry.role)) adminWsIds.add(String(w._id));
      }
      const wsIds = memberships.map((w) => w._id);
      // project rooms (task/issue/comment/sprint events) — only for member projects, or all
      // projects inside workspaces the user administers
      const projects = await Project.find({
        workspace: { $in: wsIds },
        $or: [{ members: userId }, { workspace: { $in: [...adminWsIds] } }],
      }).select('_id').lean();
      for (const p of projects) joins.push(socket.join(`project:${String(p._id)}`));
      await Promise.all(joins);
    };

    joinRooms().catch(() => undefined);

    // Allows the client to re-announce itself (e.g. after being added to a workspace).
    socket.on('df:refresh', () => {
      joinRooms().catch(() => undefined);
      socket.emit('df:rooms', { ok: true });
    });

    socket.on('disconnect', () => {
      /* rooms are cleaned up automatically by socket.io */
    });
  });

  return io;
}

export function emitEvent(target: 'user' | 'workspace' | 'project', id: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`${target}:${id}`).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown) {
  if (!io) return;
  io.emit(event, payload);
}
