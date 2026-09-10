'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, swrFetcher } from './api';
import type { AuthData, WorkspaceSummary } from './types';

export const authKey = '/auth/me';

export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR<AuthData>(authKey, swrFetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 1,
  });
  return { data, error, isLoading, mutate, authed: Boolean(data?.user), user: data?.user ?? null, workspaces: data?.workspaces ?? [] };
}

export const WS_KEY = 'df.workspace';

/** The currently selected workspace, persisted to localStorage. */
export function useWorkspace() {
  const { workspaces, authed } = useAuth();
  const [id, setId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined' || !authed) return;
    const saved = window.localStorage.getItem(WS_KEY);
    const valid = workspaces.find((w) => w.id === saved);
    setId(valid ? valid.id : (workspaces[0]?.id ?? null));
  }, [authed, workspaces]);

  const workspace = workspaces.find((w) => w.id === id) ?? null;

  const select = (next: WorkspaceSummary) => {
    window.localStorage.setItem(WS_KEY, next.id);
    setId(next.id);
    // Hard navigation clears all SWR caches so cross-workspace data never leaks.
    router.push('/dashboard');
  };

  return { workspace, workspaces, select, loading: !authed || (authed && !workspace && workspaces.length > 0) };
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** How the realtime layer invalidates SWR caches after socket events. */
function keysAffected(event: string, payload: any, apiBase: string): string[] {
  const projectId = payload?.task?.project ?? payload?.issue?.project ?? payload?.project ?? payload?.projectId ?? null;
  const workspaceId = payload?.task?.workspace ?? payload?.issue?.workspace ?? payload?.workspace ?? payload?.workspaceId ?? null;
  const subjectId = payload?.comment?.subjectId ?? payload?.subjectId ?? payload?.id ?? null;
  const keys: string[] = [];

  const addPrefix = (prefix: string) => {
    if (prefix) keys.push(prefix);
  };

  if (event.startsWith('task:')) addPrefix(projectId ? `${apiBase}/projects/${projectId}/tasks` : `${apiBase}/tasks`);
  if (event === 'task:moved') {
    if (projectId) keys.push(`${apiBase}/projects/${projectId}/tasks/board`);
  }
  if (event.startsWith('issue:')) addPrefix(projectId ? `${apiBase}/projects/${projectId}/issues` : `${apiBase}/issues`);
  if (event.startsWith('comment:')) {
    if (subjectId) keys.push(`${apiBase}/tasks/${subjectId}`, `${apiBase}/issues/${subjectId}`);
  }
  if (event.startsWith('sprint:')) {
    if (projectId) {
      keys.push(`${apiBase}/projects/${projectId}/sprints`, `${apiBase}/projects/${projectId}/tasks`);
      keys.push(`${apiBase}/projects/${projectId}/analytics`);
    }
  }
  if (['task:created', 'task:updated', 'task:moved', 'task:deleted', 'issue:created', 'issue:updated', 'issue:deleted', 'project:updated', 'project:created', 'project:deleted', 'activity:created'].includes(event)) {
    if (workspaceId) keys.push(`${apiBase}/workspaces/${workspaceId}/dashboard`);
    if (projectId) keys.push(`${apiBase}/projects/${projectId}/analytics`);
  }
  if (event.startsWith('project:')) keys.push(`${apiBase}/projects`);
  if (event === 'workspace:changed') keys.push(`${apiBase}/workspaces`, `${apiBase}/auth/me`);
  return keys;
}

type SocketCtxType = { socket: Socket | null; connected: boolean };
const SocketCtx = createContext<SocketCtxType>({ socket: null, connected: false });

/** Connects Socket.IO (cookie-authenticated through the Next.js proxy), listens for events and
 *  invalidates the affected SWR caches. Handles reconnection automatically via socket.io-client. */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const { authed } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!authed) return;
    if (socketRef.current) return;

    const socket = io(API_BASE || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const EVENT_PREFIXES = ['task:', 'issue:', 'comment:', 'sprint:', 'project:', 'activity:created', 'workspace:', 'notification:created', 'membership.changed', 'df:rooms'];
    const handler = (event: string) => (payload: unknown) => {
      const keys = keysAffected(event, payload, '');
      const prefix = (keys.find((k) => k.includes('/projects/')) ?? '') || (keys[0] ?? '');
      // Revalidate every cache whose key starts with an affected prefix.
      mutate((key: string) => {
        if (typeof key !== 'string') return false;
        if (keys.length === 0) return event === 'workspace:changed' || event === 'membership.changed';
        return keys.some((k) => k.length > 0 && key.startsWith(k));
      });
      void prefix;
    };

    for (const ev of EVENT_PREFIXES) socket.on(ev, handler(ev));
    socket.on('notification:created', (payload: any) => {
      mutate('/notifications/unread-count');
      mutate('/notifications');
    });
    socket.on('membership.changed', () => {
      mutate(authKey);
      socket.emit('df:refresh');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const value = useMemo(() => ({ socket: socketRef.current, connected }), [connected]);
  return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>;
}

export function useSocket() {
  return useContext(SocketCtx);
}

export type ThemeMode = 'dark' | 'light' | 'system';

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>('system');
  useEffect(() => {
    const saved = (window.localStorage.getItem('df.theme') as ThemeMode | null) ?? 'system';
    setModeState(saved);
    applyTheme(saved);
    const onStorage = () => {
      const m = (window.localStorage.getItem('df.theme') as ThemeMode | null) ?? 'system';
      setModeState(m);
      applyTheme(m);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = (m: ThemeMode) => {
    window.localStorage.setItem('df.theme', m);
    setModeState(m);
    applyTheme(m);
  };
  return { mode, setMode };
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
