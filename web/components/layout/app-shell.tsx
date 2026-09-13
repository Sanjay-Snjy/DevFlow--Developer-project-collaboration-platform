'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, BarChart3, Bell, CheckCheck, ChevronsUpDown, Github, KanbanSquare, LayoutDashboard,
  ListTodo, Menu as MenuIcon, Moon, Plus, Search, Settings, Sun, X, FolderKanban, Bug, Users,
} from 'lucide-react';
import useSWR from 'swr';
import { UserButton } from '@clerk/nextjs';
import { LogoIcon } from '@/components/ui/logo-icon';
import { api, qs, swrFetcher } from '@/lib/api';
import { useAuth, useDebouncedValue, useThemeMode, useWorkspace } from '@/lib/hooks';
import type { WorkspaceSummary, NotificationItem } from '@/lib/types';
import { initials, cx, timeAgo, avatarHue } from '@/lib/format';
import { Avatar, Button, EmptyState, Field, Input, Menu, MenuItem, Modal, Spinner, useToast } from '@/components/ui';

type NavItem = { href: string; label: string; icon: React.ReactNode; roles?: string[] };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, error: authError, isLoading: authLoading, mutate: mutateAuth } = useAuth();
  const { workspace } = useWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { mode, setMode } = useThemeMode();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!user) {
    return (
      <div className="center-box" style={{ minHeight: '100vh', flexDirection: 'column', gap: 16 }}>
        <div className="spinner" />
        {authError ? (
          <>
            <p style={{ color: 'var(--red)', fontSize: 14, marginTop: 12 }}>Could not connect to the server</p>
            <p style={{ color: 'var(--text-3)', fontSize: 12, maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
              {authError.message || 'The backend may not be running. Make sure it is listening on port 4000.'}
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => mutateAuth()}>Retry</button>
          </>
        ) : (
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 12 }}>Connecting to server…</p>
        )}
      </div>
    );
  }

  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: '',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
        { href: '/my-tasks', label: 'My Tasks', icon: <ListTodo /> },
      ],
    },
    {
      label: 'Planning',
      items: [
        { href: '/projects', label: 'Projects', icon: <FolderKanban /> },
        { href: '/issues', label: 'Issues', icon: <Bug /> },
        { href: '/board', label: 'Board', icon: <KanbanSquare /> },
        { href: '/activity', label: 'Activity', icon: <Activity /> },
      ],
    },
    {
      label: 'Insights',
      items: [
        { href: '/github', label: 'GitHub', icon: <Github /> },
        { href: '/analytics', label: 'Analytics', icon: <BarChart3 /> },
      ],
    },
  ];

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={cx('sidebar', sidebarOpen && 'open')}>
        <div className="sidebar-head">
          <Link href="/" aria-label="Go to landing page" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoIcon size={26} />
            <span className="logo-word">DevFlow</span>
          </Link>
          <button className="icon-btn mobile-menu-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X /></button>
        </div>

        {workspace ? (
          <WorkspaceMenu workspace={workspace} workspaces={[]} />
        ) : (
          <div className="sidebar-nav" style={{ padding: 20 }}>
            <EmptyState title="No workspace selected" sub="Create a workspace to get started" />
            <Button variant="primary" style={{ width: '100%' }} onClick={() => router.push('/settings?tab=workspace')}>New workspace</Button>
          </div>
        )}

        <nav className="sidebar-nav" aria-label="Main">
          {groups.map((g, i) => (
            <div key={i}>
              {g.label && <div className="nav-group-label">{g.label}</div>}
              {g.items.map((item) => (
                <Link key={item.href} href={item.href} className={cx('nav-link', pathname?.startsWith(item.href) && 'active')} onClick={() => setSidebarOpen(false)}>
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Link href="/settings" className="nav-link" style={{ padding: '6px 8px' }} onClick={() => setSidebarOpen(false)}>
            <Settings /> Settings
          </Link>
          <div className="flex" style={{ padding: '6px 8px' }}>
            <Avatar user={user} size="sm" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11.5 }}>@{user.username}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="icon-btn mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><MenuIcon /></button>
          <button className="topbar-search" onClick={() => setSearchOpen(true)} role="search">
            <Search />
            <span>Search tasks, issues, projects…</span>
            <span className="kbd" style={{ marginLeft: 'auto' }}>Ctrl+K</span>
          </button>
          <div className="topbar-right">
            <NotificationBell workspaceId={workspace?.id} />
            <ThemeButton mode={mode} setMode={setMode} />
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} workspaceId={workspace?.id} />
    </div>
  );
}

// ── Workspace switcher ─────────────────────────────────────────────
function WorkspaceMenu({ workspace }: { workspace: WorkspaceSummary; workspaces: WorkspaceSummary[] }) {
  const { workspaces, select } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const hue = avatarHue(workspace.name);

  const create = async () => {
    setBusy(true);
    try {
      const ws = await api.post<WorkspaceSummary>('/workspaces', { name, description: desc });
      toast.push('success', 'Workspace created');
      setCreateOpen(false);
      setName('');
      setDesc('');
      select(ws);
    } catch (e: any) {
      toast.push('error', 'Could not create workspace', e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu
        align="left"
        width={250}
        label="Switch workspace"
        button={
          <div className="workspace-switch">
            <span className="ws-avatar" style={{ ['--hue' as any]: hue }}>{initials(workspace.name)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{workspace.role.toLowerCase()}</div>
            </div>
            <ChevronsUpDown style={{ width: 15, color: 'var(--text-3)' }} />
          </div>
        }
      >
        <div className="menu-label">Workspaces</div>
        {workspaces.map((w) => (
          <button key={w.id} className="menu-item" onClick={() => select(w)}>
            <span className="ws-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{initials(w.name)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
          </button>
        ))}
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => setCreateOpen(true)}><Plus /> New workspace</button>
      </Menu>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a workspace"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy || name.trim().length < 2} onClick={create}>Create workspace</Button>
          </>
        }
      >
        <Field label="Name" hint="E.g. Acme Development Team">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="Description">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does your team build?" />
        </Field>
      </Modal>
      <button onClick={() => router.push('/settings')} />
    </>
  );
}

// ── Theme toggle ───────────────────────────────────────────────────
function ThemeButton({ mode, setMode }: { mode: 'dark' | 'light' | 'system'; setMode: (m: 'dark' | 'light' | 'system') => void }) {
  const next: 'light' | 'dark' = mode === 'dark' || (mode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  return (
    <Menu align="right" label="Theme" button={<button className="icon-btn" aria-label="Toggle theme">{mode === 'light' ? <Sun /> : <Moon />}</button>}>
      <MenuItem onClick={() => setMode('dark')}><Moon /> Dark</MenuItem>
      <MenuItem onClick={() => setMode('light')}><Sun /> Light</MenuItem>
      <MenuItem onClick={() => setMode('system')}><Monitor /> System</MenuItem>
    </Menu>
  );
}

function Monitor() {
  return <div style={{ width: 15, height: 15, border: '1.5px solid currentColor', borderRadius: 3 }} />;
}

// ── Notifications ──────────────────────────────────────────────────
function NotificationBell({ workspaceId }: { workspaceId?: string }) {
  const { data: unread } = useSWR<{ unread: number }>('/notifications/unread-count', swrFetcher, { refreshInterval: 30000 });
  const { data: list } = useSWR<{ items: NotificationItem[] }>('/notifications?limit=8', swrFetcher);
  const toast = useToast();

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      await Promise.all([
        (await import('swr')).mutate('/notifications/unread-count'),
        (await import('swr')).mutate('/notifications'),
      ]);
    } catch {
      toast.push('error', 'Could not update notifications');
    }
  };

  return (
    <Menu
      label="Notifications"
      button={
        <button className="icon-btn" aria-label="Notifications">
          <Bell />
          {(unread?.unread ?? 0) > 0 && <span className="bell-dot">{unread!.unread > 9 ? '9+' : unread!.unread}</span>}
        </button>
      }
    >
      <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
        <div className="menu-label flex" style={{ justifyContent: 'space-between' }}>
          Notifications
          {(unread?.unread ?? 0) > 0 && (
            <button className="mini-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} onClick={markAll}>
              <CheckCheck style={{ width: 12 }} /> Mark all read
            </button>
          )}
        </div>
        {!list ? (
          <div style={{ padding: 18 }}><Spinner label="Loading…" /></div>
        ) : list.items.length === 0 ? (
          <EmptyState title="No notifications" sub="You're all caught up." icon={<Bell />} />
        ) : (
          list.items.map((n) => (
            <Link key={n.id} href={n.link || '/notifications'} className={cx('notif-item', !n.readAt && 'unread')}>
              <span className="notif-dot" style={{ opacity: n.readAt ? 0 : 1 }} />
              <div style={{ minWidth: 0 }}>
                <div className="ni-title">{n.title}</div>
                {n.body && <div className="ni-body">{n.body}</div>}
                <div className="ni-time">{timeAgo(n.createdAt)}</div>
              </div>
            </Link>
          ))
        )}
        <Link href="/notifications"><div className="menu-item"><Bell style={{ width: 14 }} /> View all notifications</div></Link>
      </div>
    </Menu>
  );
}

// ── Global search dialog ───────────────────────────────────────────
type SearchSections = Array<{ type: string; label: string; items: any[] }>;

function SearchDialog({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId?: string }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const debounced = useDebouncedValue(q, 220);
  const [data, setData] = useState<SearchSections | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setData(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !workspaceId || !debounced.trim() || debounced.trim().length < 2) {
      if (!debounced.trim()) setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get<{ sections: SearchSections }>(`/workspaces/${workspaceId}/search${qs({ q: debounced, type })}`)
      .then((r) => !cancelled && setData(r.sections))
      .catch((e) => !cancelled && setError(e?.message ?? 'Search failed'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, type, workspaceId, open]);

  if (!open) return null;

  const linkFor = (item: any) => {
    if (item.project) {
      const pid = item.project.id;
      if (item.subjectType === 'issue') return `/projects/${pid}/issues/${item.subjectId}`;
      if (item.subjectType === 'task') return `/projects/${pid}/tasks/${item.subjectId}`;
    }
    if (item.type === undefined) {
      // projects section items carry key/name
      return `/projects/${item.id}`;
    }
    return '';
  };

  const labelFor = (item: any) => {
    if (item.key) return item.key;
    return '';
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '9vh' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-label="Global search">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search style={{ width: 18, color: 'var(--text-3)' }} />
          <input
            ref={inputRef}
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Search this workspace…"
            style={{ border: 'none', boxShadow: 'none', background: 'transparent', fontSize: 15 }}
            aria-label="Search"
          />
          <button className="btn btn-sm" onClick={onClose}>esc</button>
        </div>
        <div className="filter-bar" style={{ padding: '10px 16px 0', margin: 0 }}>
          {[
            ['all', 'All'], ['tasks', 'Tasks'], ['issues', 'Issues'], ['projects', 'Projects'], ['members', 'People'], ['comments', 'Comments'],
          ].map(([k, l]) => (
            <button key={k} className={cx('btn btn-sm', type === k ? 'btn-soft' : 'btn-ghost')} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>
        <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: '6px 10px 14px' }}>
          {loading && <Spinner label="Searching…" />}
          {!loading && !data && q.length < 2 && <div className="center dim" style={{ padding: 30 }}>Type at least 2 characters to search.</div>}
          {!loading && error && <div className="center" style={{ padding: 30, color: 'var(--red)' }}>{error}</div>}
          {!loading && data && data.length === 0 && <div className="center dim" style={{ padding: 30 }}>No results for “{debounced}”.</div>}
          {!loading &&
            data?.map((section) => (
              <div key={section.type}>
                <div className="search-group-label">{section.label}</div>
                {section.items.map((item: any, idx: number) => (
                  <Link key={idx} href={linkFor(item) || '#'} className="row-link" onClick={onClose}>
                    {item.type !== undefined && <span className={cx('badge badge-soft', item.status === 'DONE' && 'badge-green', item.status === 'BLOCKED' && 'badge-red', item.type === 'BUG' && 'badge-red', item.type === 'FEATURE' && 'badge-blue', item.type === 'IMPROVEMENT' && 'badge-violet', item.type === 'QUESTION' && 'badge-amber')}>{item.key ?? item.status ?? item.type}</span>}
                    <div className="row-main">
                      <div className="row-title">{item.title ?? item.name ?? `@${item.username}`}</div>
                      {item.content && <div className="row-sub">{item.content}</div>}
                      {item.project && <div className="row-sub">{item.project.key} · {item.project.name}</div>}
                      {item.role && <div className="row-sub">{item.role.toLowerCase()}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
