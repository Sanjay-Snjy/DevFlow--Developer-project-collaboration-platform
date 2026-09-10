'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { FolderKanban, Plus } from 'lucide-react';
import { api, qs, swrFetcher } from '@/lib/api';
import { CAN_MANAGE, PROJECT_STATUS_LABEL } from '@/lib/constants';
import { roleAtLeast } from '@/lib/constants';
import { useAuth, useWorkspace } from '@/lib/hooks';
import type { ProjectSummary, WorkspaceSummary } from '@/lib/types';
import { AvatarStack, Button, EmptyState, ErrorState, Field, Input, Modal, Progress, Select, Spinner, Textarea, errMsg, useToast } from '@/components/ui';
import { cx, fmtDate, todayISO, isoFromLocalInput } from '@/lib/format';

export default function ProjectsPage() {
  const { workspace } = useWorkspace();
  const { workspaces } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<ProjectSummary[]>(workspace ? `/projects?workspace=${workspace.id}` : null, swrFetcher, { refreshInterval: 20000 });
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();
  const canCreate = workspace ? roleAtLeast(workspace.role, 'MANAGER') : false;

  if (!workspace) return <div />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">{workspace.name} · {data?.length ?? '—'} projects</p>
        </div>
        <div className="page-actions">
          {canCreate && <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> New project</Button>}
        </div>
      </div>

      {isLoading && <Spinner label="Loading projects…" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <EmptyState icon={<FolderKanban />} title="No projects yet" sub="Create a project to start tracking tasks, issues and sprints." action={canCreate ? <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> Create your first project</Button> : undefined} />
      )}

      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {data!.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color .12s', cursor: 'pointer' }}>
              <div className="flex" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span className="mono badge badge-accent">{p.key}</span>
                <span className={cx('badge', p.status === 'ACTIVE' && 'badge-green', p.status === 'PLANNING' && 'badge-amber', p.status === 'ON_HOLD' && 'badge-amber', p.status === 'COMPLETED' && 'badge-blue', p.status === 'ARCHIVED' && 'badge-soft')}>{PROJECT_STATUS_LABEL[p.status]}</span>
              </div>
              <div>
                <h3 style={{ fontSize: 16 }}>{p.name}</h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description || 'No description'}</p>
              </div>
              {p.stats.totalTasks > 0 && (
                <div>
                  <Progress value={p.stats.totalTasks ? Math.round((p.stats.doneTasks / p.stats.totalTasks) * 100) : 0} />
                </div>
              )}
              <div className="flex" style={{ justifyContent: 'space-between' }}>
                <AvatarStack users={p.members} />
                <span className="dim" style={{ fontSize: 12 }}>
                  {p.stats.doneTasks}/{p.stats.totalTasks} done · {p.stats.openIssues} issues{p.dueDate ? ` · due ${fmtDate(p.dueDate, { month: 'short', day: 'numeric' })}` : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {createOpen && <CreateProjectModal open onClose={() => setCreateOpen(false)} workspaces={workspaces} defaultWs={workspace} mutate={mutate} />}
    </div>
  );
}

function CreateProjectModal({ open, onClose, workspaces, defaultWs, mutate }: { open: boolean; onClose: () => void; workspaces: WorkspaceSummary[]; defaultWs: WorkspaceSummary; mutate: () => void }) {
  const toast = useToast();
  const [wsId, setWsId] = useState(defaultWs.id);
  const [form, setForm] = useState({ key: '', name: '', description: '', priority: 'MEDIUM', startDate: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      const p = await api.post<ProjectSummary>('/projects', {
        workspaceId: wsId,
        key: form.key.toUpperCase(),
        name: form.name,
        description: form.description,
        priority: form.priority,
        startDate: isoFromLocalInput(form.startDate),
        dueDate: isoFromLocalInput(form.dueDate),
      });
      toast.push('success', `${p.key} created`);
      onClose();
      mutate();
    } catch (e: any) {
      toast.push('error', 'Could not create project', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !form.name.trim() || !/^[A-Z][A-Z0-9]{1,5}$/.test(form.key)} onClick={submit}>{busy ? 'Creating…' : 'Create project'}</Button>
        </>
      }
    >
      {workspaces.length > 1 && (
        <Field label="Workspace">
          <Select value={wsId} onChange={(e) => setWsId(e.target.value)}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="Key" hint="2-6 uppercase letters, e.g. DEV">
          <Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))} placeholder="DEV" maxLength={6} style={{ textTransform: 'uppercase', fontFamily: 'var(--mono)' }} />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={set('priority')}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Name">
        <Input value={form.name} onChange={set('name')} placeholder="DevFlow Platform" autoFocus />
      </Field>
      <Field label="Description">
        <Textarea value={form.description} onChange={set('description')} rows={3} />
      </Field>
      <div className="form-grid">
        <Field label="Start date"><Input type="date" value={form.startDate} max={todayISO()} onChange={set('startDate')} /></Field>
        <Field label="Due date"><Input type="date" value={form.dueDate} onChange={set('dueDate')} /></Field>
      </div>
    </Modal>
  );
}
