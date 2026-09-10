'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Bell, Check, ChevronRight, Github, KeyRound, LogOut, Monitor, Moon, Palette,
  Shield, Sun, Trash2, UserRound, Users, Link2, Unplug, Copy,
} from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { authKey, useAuth, useThemeMode, useWorkspace } from '@/lib/hooks';
import { ROLE_LABEL, roleAtLeast, type Role } from '@/lib/constants';
import type { GithubStatus, WorkspaceDetail } from '@/lib/types';
import { Avatar, Button, Confirm, EmptyState, ErrorState, Field, Input, Menu, MenuItem, Select, Spinner, Switch, Textarea, errMsg, useToast } from '@/components/ui';
import { cx, timeAgo } from '@/lib/format';

const TABS = [
  { key: 'profile', label: 'Profile', icon: <UserRound /> },
  { key: 'security', label: 'Security', icon: <Shield /> },
  { key: 'appearance', label: 'Appearance', icon: <Palette /> },
  { key: 'notifications', label: 'Notifications', icon: <Bell /> },
  { key: 'workspace', label: 'Workspace', icon: <Users /> },
  { key: 'integrations', label: 'Integrations', icon: <Link2 /> },
];

const PREF_LABELS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'taskAssigned', label: 'Task assignments', hint: 'When a task or issue is assigned to you' },
  { key: 'mentions', label: 'Mentions', hint: 'When someone @mentions you in a comment' },
  { key: 'comments', label: 'Comments & replies', hint: 'When someone comments on your tasks or watched items' },
  { key: 'projectActivity', label: 'Project activity', hint: 'Task status changes, invitations and membership changes' },
  { key: 'githubActivity', label: 'GitHub activity', hint: 'Repository events that affect your projects' },
  { key: 'aiNotifications', label: 'AI results', hint: 'When an AI analysis or summary finishes' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '');
    const allowed = TABS.map((t) => t.key);
    if (fromHash && allowed.includes(fromHash)) setTab(fromHash);
    const params = new URLSearchParams(window.location.search);
    const q = params.get('tab');
    if (q && allowed.includes(q)) setTab(q);
  }, []);

  if (!user) return <Spinner label="Loading…" />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Your account, workspace and integrations.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 22, alignItems: 'start' }} className="set-grid">
        <nav className="card card-pad stack" style={{ padding: 8 }} aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.key} className={cx('nav-link', tab === t.key && 'active')} onClick={() => setTab(t.key)} style={{ display: 'flex', width: '100%' }}>
              {t.icon} {t.label}
              <ChevronRight style={{ width: 13, marginLeft: 'auto', opacity: 0.5 }} />
            </button>
          ))}
        </nav>
        <div>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'workspace' && <WorkspaceTab />}
          {tab === 'integrations' && <IntegrationsTab />}
        </div>
      </div>
      <style jsx>{`@media (max-width: 860px){ .set-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function ProfileTab() {
  const { user, mutate } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: user?.name ?? '', bio: user?.bio ?? '', skills: (user?.skills ?? []).join(', '), githubUsername: user?.githubUsername ?? '', avatarUrl: user?.avatarUrl ?? '' });

  useEffect(() => {
    setForm({ name: user?.name ?? '', bio: user?.bio ?? '', skills: (user?.skills ?? []).join(', '), githubUsername: user?.githubUsername ?? '', avatarUrl: user?.avatarUrl ?? '' });
  }, [user]);

  const save = async () => {
    if (form.name.trim().length < 2) return setError('Name must be at least 2 characters');
    setBusy(true);
    setError('');
    try {
      await api.patch('/me', {
        name: form.name.trim(),
        bio: form.bio.trim(),
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30),
        githubUsername: form.githubUsername.trim().replace(/^@/, ''),
        avatarUrl: form.avatarUrl.trim(),
      });
      toast.push('success', 'Profile saved');
      mutate();
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad">
      <div className="flex mb" style={{ gap: 16 }}>
        <Avatar user={user} size="lg" />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
          <div className="dim">@{user?.username} · {user?.email}</div>
          <div className="dim" style={{ fontSize: 12 }}>Member since {user?.createdAt ? timeAgo(user.createdAt) : '—'}</div>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Full name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Avatar URL"><Input value={form.avatarUrl} onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))} placeholder="https://…" /></Field>
      </div>
      <Field label="Bio"><Textarea rows={2} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} placeholder="What do you build?" /></Field>
      <div className="form-grid">
        <Field label="Skills" hint="Comma separated"><Input value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} placeholder="TypeScript, MongoDB, DevOps" /></Field>
        <Field label="GitHub username"><Input value={form.githubUsername} onChange={(e) => setForm((f) => ({ ...f, githubUsername: e.target.value }))} placeholder="octocat" /></Field>
      </div>
      {error && <div className="error-text mb">{error}</div>}
      <Button variant="primary" disabled={busy} onClick={save}><Check style={{ width: 14 }} /> {busy ? 'Saving…' : 'Save profile'}</Button>
    </section>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (form.newPassword.length < 8) return setError('New password must be at least 8 characters');
    if (form.newPassword !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    setError('');
    try {
      await api.post('/me/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.push('success', 'Password updated');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad">
      <h3 style={{ marginBottom: 6 }}>Change password</h3>
      <p className="muted mb" style={{ fontSize: 13 }}>Passwords are hashed with bcrypt and never stored in plain text. Signing out revokes all existing sessions.</p>
      <div style={{ maxWidth: 420 }}>
        <Field label="Current password"><Input type="password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} /></Field>
        <Field label="New password"><Input type="password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} /></Field>
        <Field label="Confirm new password"><Input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} /></Field>
        {error && <div className="error-text mb">{error}</div>}
        <Button variant="primary" disabled={busy || !form.currentPassword} onClick={save}><KeyRound style={{ width: 14 }} /> Update password</Button>
      </div>
    </section>
  );
}

function AppearanceTab() {
  const { mode, setMode } = useThemeMode();
  const options: Array<{ key: 'dark' | 'light' | 'system'; label: string; icon: React.ReactNode; sub: string }> = [
    { key: 'dark', label: 'Dark', icon: <Moon />, sub: 'Developer default — easy on the eyes at night' },
    { key: 'light', label: 'Light', icon: <Sun />, sub: 'Bright for daytime work' },
    { key: 'system', label: 'System', icon: <Monitor />, sub: 'Follow your operating system preference' },
  ];
  return (
    <section className="card card-pad">
      <h3 style={{ marginBottom: 6 }}>Theme</h3>
      <p className="muted mb" style={{ fontSize: 13 }}>Applied instantly and saved on this device.</p>
      <div className="stack" style={{ maxWidth: 460 }}>
        {options.map((o) => (
          <button key={o.key} onClick={() => setMode(o.key)} className={cx('flex card-pad', mode === o.key && 'selected-opt')}
            style={{ display: 'flex', gap: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-2)', cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
            <span style={{ color: 'var(--accent)' }}>{o.icon}</span>
            <span className="grow">
              <span style={{ fontWeight: 700 }}>{o.label}</span>
              <span className="row-sub">{o.sub}</span>
            </span>
            {mode === o.key && <Check style={{ width: 16, color: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
    </section>
  );
}

function NotificationsTab() {
  const { user, mutate } = useAuth();
  const toast = useToast();
  const prefs = user?.notificationPrefs ?? {};
  const toggle = async (key: string, value: boolean) => {
    try {
      await api.patch('/me', { notificationPrefs: { [key]: value } });
      toast.push('success', 'Preference saved');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Could not save', e?.message);
    }
  };
  return (
    <section className="card card-pad">
      <h3 style={{ marginBottom: 6 }}>Email-style notifications</h3>
      <p className="muted mb" style={{ fontSize: 13 }}>Choose which events create notifications for you. Changes apply immediately.</p>
      <div className="stack" style={{ maxWidth: 520 }}>
        {PREF_LABELS.map((p) => (
          <div key={p.key} className="flex" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.label}</div>
              <div className="dim" style={{ fontSize: 12 }}>{p.hint}</div>
            </div>
            <Switch checked={prefs[p.key] !== false} onChange={(v) => toggle(p.key, v)} label="" />
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkspaceTab() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<WorkspaceDetail>(workspace ? `/workspaces/${workspace.id}` : null, swrFetcher);
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('DEVELOPER');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);

  useEffect(() => {
    if (data) setForm({ name: data.name, description: data.description ?? '' });
  }, [data]);

  if (!workspace) return <EmptyState title="No workspace selected" sub="Join or create a workspace first." />;
  if (isLoading && !data) return <Spinner label="Loading workspace…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!data) return null;

  const canAdmin = roleAtLeast(data.myRole, 'ADMIN');
  const ROLES: Role[] = ['ADMIN', 'MANAGER', 'DEVELOPER', 'VIEWER'];

  const saveWorkspace = async () => {
    setBusy(true);
    try {
      await api.patch(`/workspaces/${workspace.id}`, { name: form.name.trim(), description: form.description.trim() });
      toast.push('success', 'Workspace updated');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ acceptToken: string }>(`/workspaces/${workspace.id}/invitations`, { email: inviteEmail.trim().toLowerCase(), role: inviteRole });
      setInviteLink(`${window.location.origin}/invitations?token=${r.acceptToken}`);
      setInviteEmail('');
      toast.push('success', 'Invitation created — share the link with your teammate');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Invite failed', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: string, role: string) => {
    try {
      await api.patch(`/workspaces/${workspace.id}/members/${userId}/role`, { role });
      toast.push('success', 'Role updated');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  const removeMember = async () => {
    if (!removeTarget) return;
    try {
      await api.del(`/workspaces/${workspace.id}/members/${removeTarget}`);
      toast.push('success', 'Member removed');
      setRemoveTarget(null);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Remove failed', e?.message);
    }
  };

  const leaveWorkspace = async () => {
    try {
      await api.del(`/workspaces/${workspace.id}/members/${user?.id ?? ''}`);
      toast.push('success', 'You left the workspace');
      router.push('/dashboard');
    } catch (e: any) {
      toast.push('error', 'Could not leave', e?.message);
    }
  };

  const destroy = async () => {
    try {
      await api.del(`/workspaces/${workspace.id}`);
      toast.push('success', 'Workspace deleted');
      router.push('/dashboard');
    } catch (e: any) {
      toast.push('error', 'Delete failed', e?.message);
    }
  };

  return (
    <div className="stack">
      <section className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>{workspace.name}</h3>
        <div className="dim mb" style={{ fontSize: 12.5 }}>{workspace.description} · {data.stats.projectCount} projects · {data.stats.taskTotal} tasks · {data.stats.openIssues} open issues</div>
        <div className="form-grid">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="URL"><Input value={workspace.slug} disabled /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        <Button variant="primary" disabled={busy || form.name.trim().length < 2} onClick={saveWorkspace}><Check style={{ width: 14 }} /> Save workspace</Button>
      </section>

      <section className="card card-pad">
        <h3 style={{ marginBottom: 10 }}>Members ({data.members.length})</h3>
        <div className="card">
          {data.members.map((m) => (
            <div key={m.id} className="flex" style={{ gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <Avatar user={m} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="flex gap-sm">
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</span>
                  <span className="dim" style={{ fontSize: 12 }}>@{m.username}</span>
                  {m.id === workspace.ownerId && <span className="badge badge-accent">owner</span>}
                </div>
                <div className="dim" style={{ fontSize: 12 }}>{m.email} {m.joinedAt ? `· joined ${timeAgo(m.joinedAt)}` : ''}</div>
              </div>
              {canAdmin && m.role !== 'OWNER' ? (
                <Select className="btn-sm" style={{ width: 'auto' }} value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} aria-label={`Role for ${m.name}`}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              ) : (
                <span className="badge badge-soft">{ROLE_LABEL[m.role as Role]}</span>
              )}                  {m.id !== workspace.ownerId && (
                    <Menu label="Member actions" button={<button className="icon-btn" style={{ width: 28, height: 28 }}><ChevronRight style={{ width: 14 }} /></button>}>
                      {m.id === user?.id && <MenuItem onClick={leaveWorkspace}><LogOut style={{ width: 14 }} /> Leave workspace</MenuItem>}
                      {canAdmin && m.role !== 'OWNER' && m.id !== user?.id && <MenuItem className="danger" onClick={() => setRemoveTarget(m.id)}><Trash2 style={{ width: 14 }} /> Remove member</MenuItem>}
                    </Menu>
                  )}
            </div>
          ))}
        </div>
      </section>

      {canAdmin && (
        <section className="card card-pad">
          <h3 style={{ marginBottom: 6 }}>Invite teammates</h3>
          <p className="muted mb" style={{ fontSize: 13 }}>Existing DevFlow accounts get an in-app notification; new people get a link to sign up. Owner cannot be invited.</p>
          <div className="flex" style={{ maxWidth: 560 }}>
            <Input placeholder="teammate@company.com" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} aria-label="Email to invite" />
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: 'auto' }} aria-label="Role for invite">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Button variant="primary" disabled={busy || !inviteEmail.trim().includes('@')} onClick={invite}>Invite</Button>
          </div>
          {inviteLink && (
            <div className="card card-pad mt" style={{ borderColor: 'var(--accent)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Share this invite link <span className="chip">expires in 7 days</span></div>
              <div className="flex">
                <Input value={inviteLink} readOnly onFocus={(e) => e.target.select()} />
                <Button variant="soft" size="sm" onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}><Copy style={{ width: 13 }} /> {copied ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {data.myRole === 'OWNER' && (
        <section className="card card-pad">
          <h3 style={{ marginBottom: 10 }} className="danger" >Danger zone</h3>
          <p className="muted mb" style={{ fontSize: 13 }}>Deleting removes every project, task, issue and comment in {workspace.name}. This cannot be undone.</p>
          <Button variant="danger" onClick={() => setDelOpen(true)}><Trash2 style={{ width: 14 }} /> Delete workspace</Button>
        </section>
      )}

      <Confirm open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)} onConfirm={removeMember} title="Remove member?" message="They lose access to the workspace and their assigned tasks become unassigned." confirmLabel="Remove" danger />
      <Confirm open={delOpen} onClose={() => setDelOpen(false)} onConfirm={destroy} title={`Delete ${workspace.name}?`} message="This permanently deletes the workspace and all of its data." confirmLabel="Delete workspace" danger />
    </div>
  );
}

function IntegrationsTab() {
  const toast = useToast();
  const { data: status, mutate } = useSWR<GithubStatus>('/github/status', swrFetcher, { refreshInterval: 30000 });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('github') === 'connected') setNotice(`Connected as ${params.get('account') ?? 'your GitHub account'}`);
    if (params.get('github') === 'error') setNotice(`GitHub connection failed (${params.get('reason') ?? 'unknown'})`);
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await api.get<{ url: string }>('/github/connect');
      window.location.href = r.url;
    } catch (e: any) {
      toast.push('error', 'Cannot start OAuth', e?.message);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.del('/github/account');
      toast.push('success', 'GitHub disconnected');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Disconnect failed', e?.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <Spinner label="Loading…" />;
  const account = status.account;

  return (
    <div className="stack">
      {notice && (
        <div className="chip" style={{ borderColor: 'var(--accent)', padding: '8px 12px' }}>
          <Github style={{ width: 14 }} /> {notice}
        </div>
      )}
      <section className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>GitHub</h3>
        <p className="muted mb" style={{ fontSize: 13 }}>
          Connecting your GitHub account lets DevFlow read your repositories (commits, issues, pull requests) so you can link them to projects.
        </p>
        <div className="flex" style={{ gap: 14 }}>
          <div className="flex" style={{ gap: 10 }}>
            <Avatar user={account ? { name: account.username } : undefined} />
            <div>
              <div style={{ fontWeight: 700 }}>{account ? `@${account.username}` : 'No account connected'}</div>
              <div className="dim" style={{ fontSize: 12.5 }}>
                {status.oauthConfigured ? (account ? `scopes: ${account.scopes.join(', ') || 'repo'} · connected ${timeAgo(account.connectedAt)}` : 'OAuth ready — click Connect') : 'OAuth not configured on the server'}
              </div>
            </div>
          </div>
          {account ? (
            <Button variant="ghost" disabled={busy} onClick={disconnect}><Unplug style={{ width: 14 }} /> Disconnect</Button>
          ) : status.oauthConfigured ? (
            <Button variant="primary" disabled={busy} onClick={connect}><Link2 style={{ width: 14 }} /> Connect GitHub</Button>
          ) : (
            <span className="chip">GITHUB_CLIENT_ID / SECRET unset — see backend/.env.example</span>
          )}
        </div>
      </section>
      <section className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>About this server</h3>
        <div className="dim" style={{ fontSize: 13 }}>
          GitHub API: {status.serverConfigured ? 'configured' : 'not configured'} · OAuth: {status.oauthConfigured ? 'configured' : 'not configured'}. Data is fetched through the DevFlow backend — no client secrets are exposed.
        </div>
      </section>
    </div>
  );
}
