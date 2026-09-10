'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Activity, BarChart3, Bug, FolderKanban, Github, GitBranch, ListTodo, Pencil, Settings, Swords, Trash2, Users } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { CAN_ADMIN, PROJECT_STATUSES, PROJECT_STATUS_LABEL, roleAtLeast } from '@/lib/constants';
import type { ProjectDetail } from '@/lib/types';
import { Button, Confirm, ErrorState, Field, Input, Menu, MenuItem, Modal, Select, Textarea, errMsg, useToast } from '@/components/ui';
import { cx, isoFromLocalInput } from '@/lib/format';

const TABS = [
  { key: '', label: 'Overview', icon: <FolderKanban />, href: (id: string) => `/projects/${id}` },
  { key: 'tasks', label: 'Tasks', icon: <ListTodo />, href: (id: string) => `/projects/${id}/tasks` },
  { key: 'board', label: 'Board', icon: <Swords />, href: (id: string) => `/projects/${id}/board` },
  { key: 'issues', label: 'Issues', icon: <Bug />, href: (id: string) => `/projects/${id}/issues` },
  { key: 'members', label: 'Members', icon: <Users />, href: (id: string) => `/projects/${id}/members` },
  { key: 'sprints', label: 'Sprints', icon: <GitBranch />, href: (id: string) => `/projects/${id}/sprints` },
  { key: 'activity', label: 'Activity', icon: <Activity />, href: (id: string) => `/projects/${id}/activity` },
  { key: 'github', label: 'GitHub', icon: <Github />, href: (id: string) => `/projects/${id}/github` },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 />, href: (id: string) => `/projects/${id}/analytics` },
  { key: 'settings', label: 'Settings', icon: <Settings />, href: (id: string) => `/projects/${id}/settings` },
];

export function useProject(projectId: string) {
  const { data, error, isLoading, mutate } = useSWR<ProjectDetail>(projectId ? `/projects/${projectId}` : null, swrFetcher, { refreshInterval: 20000 });
  return { project: data, error, isLoading, mutate };
}

export default function ProjectShell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const { project, error, isLoading, mutate } = useProject(projectId);
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const toast = useToast();

  if (isLoading || !project) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 40, width: '45%' }} />
        <div className="skeleton" style={{ height: 34, width: '90%' }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const canManage = roleAtLeast(project.myRole, 'MANAGER');
  const canAdmin = roleAtLeast(project.myRole, 'ADMIN');
  const activeTab = pathname.replace(`/projects/${projectId}`, '').split('/').filter(Boolean)[0] ?? '';

  const deleteProject = async () => {
    try {
      await api.del(`/projects/${projectId}`);
      toast.push('success', 'Project deleted');
      router.push('/projects');
    } catch (e: any) {
      toast.push('error', 'Delete failed', e?.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="flex gap-sm">
            <span className="mono badge badge-accent">{project.key}</span>
            <span className="badge badge-soft">{PROJECT_STATUS_LABEL[project.status]}</span>
            {project.archivedAt && <span className="badge badge-red">Archived</span>}
            {project.workspace && (
              <Link href={`/dashboard`} className="dim" style={{ fontSize: 12.5 }}>{project.workspace.name}</Link>
            )}
          </div>
          <h1 className="page-title" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{project.name}</h1>
          {project.description && <p className="page-sub" style={{ maxWidth: 720 }}>{project.description}</p>}
        </div>
        <div className="page-actions">
          <Menu
            label="Project status"
            button={<Button>Status ▾</Button>}
          >
            {PROJECT_STATUSES.filter((s) => s !== 'ARCHIVED' || canAdmin).map((s) => (
              <MenuItem
                key={s}
                onClick={async () => {
                  try {
                    await api.patch(`/projects/${projectId}`, { status: s });
                    toast.push('success', `Project is now ${PROJECT_STATUS_LABEL[s]}`);
                    mutate();
                  } catch (e: any) {
                    toast.push('error', 'Update failed', e?.message);
                  }
                }}
              >
                {PROJECT_STATUS_LABEL[s]}
              </MenuItem>
            ))}
            {canAdmin && (
              <MenuItem
                className="danger"
                onClick={async () => {
                  try {
                    await api.patch(`/projects/${projectId}`, { status: 'ARCHIVED' });
                    toast.push('success', 'Project archived');
                    mutate();
                  } catch (e: any) {
                    toast.push('error', 'Archive failed', e?.message);
                  }
                }}
              >
                Archive project
              </MenuItem>
            )}
          </Menu>
          {canManage && <Button variant="ghost" onClick={() => setEditOpen(true)}><Pencil style={{ width: 14 }} /> Edit</Button>}
          {canAdmin && (
            <Button variant="danger" onClick={() => setDelOpen(true)}><Trash2 style={{ width: 14 }} /> Delete</Button>
          )}
        </div>
      </div>

      <div className="tabs mb" role="navigation" aria-label="Project sections">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href(projectId)} className={cx('tab', activeTab === t.key && 'active')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t.icon}
              {t.label}
            </span>
          </Link>
        ))}
      </div>

      {children}

      {editOpen && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={() => mutate()}
        />
      )}
      <Confirm
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={deleteProject}
        title={`Delete ${project.key}?`}
        message="This permanently deletes the project, its tasks, issues, comments and sprints. This cannot be undone."
        danger
      />
    </div>
  );
}

export function EditProjectModal({ project, onClose, onSaved }: { project: ProjectDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
    priority: project.priority ?? 'MEDIUM',
    status: project.status,
    startDate: project.startDate ? project.startDate.slice(0, 10) : '',
    dueDate: project.dueDate ? project.dueDate.slice(0, 10) : '',
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/projects/${project.id}`, {
        name: form.name,
        description: form.description,
        priority: form.priority,
        status: form.status,
        startDate: isoFromLocalInput(form.startDate),
        dueDate: isoFromLocalInput(form.dueDate),
      });
      toast.push('success', 'Project updated');
      onClose();
      onSaved();
    } catch (e: any) {
      toast.push('error', 'Update failed', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${project.key}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || form.name.trim().length < 2} onClick={submit}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={set('status')}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={set('description')} rows={3} />
      </Field>
      <div className="form-grid">
        <Field label="Priority">
          <Select value={form.priority} onChange={set('priority')}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
        <div />
      </div>
      <div className="form-grid">
        <Field label="Start date"><Input type="date" value={form.startDate} onChange={set('startDate')} /></Field>
        <Field label="Due date"><Input type="date" value={form.dueDate} onChange={set('dueDate')} /></Field>
      </div>
    </Modal>
  );
}
