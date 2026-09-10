'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckCircle2, ChevronDown, GitBranch, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { roleAtLeast } from '@/lib/constants';
import type { Sprint, Task } from '@/lib/types';
import { useProject } from '@/features/project/project-shell';
import SprintPlannerModal from '@/features/ai/sprint-planner';
import { useProjectOptions } from '@/features/tasks/task-form';
import { Button, Confirm, EmptyState, ErrorState, Field, Input, Menu, MenuItem, Modal, Select, Spinner, Textarea, errMsg, useToast } from '@/components/ui';
import { Avatar, Progress } from '@/components/ui';
import { DueChip, TaskStatusBadge } from '@/components/entities';
import { fmtDate, isoFromLocalInput, toLocalInput } from '@/lib/format';

type SprintDetail = Sprint & { tasks: Task[] };

export default function SprintsPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const { project } = useProject(pid);
  const { data, error, isLoading, mutate } = useSWR<{ items: Sprint[] }>(pid ? `/projects/${pid}/sprints` : null, swrFetcher, { refreshInterval: 15000 });
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);
  const canManage = project ? roleAtLeast(project.myRole, 'MANAGER') : false;

  const update = async (s: Sprint, payload: Record<string, unknown>, label: string) => {
    try {
      await api.patch(`/sprints/${s.id}`, payload);
      toast.push('success', label);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  const removeTasks = async (sprint: Sprint, taskIds: string[]) => {
    try {
      await api.del(`/sprints/${sprint.id}/tasks`, { taskIds });
      toast.push('success', 'Tasks moved back to backlog');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  if (isLoading && !data) return <Spinner label="Loading sprints…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sprints</h1>
          <p className="page-sub">Time-boxed iterations for {project?.key ?? ''}.</p>
        </div>
        {canManage && (
          <div className="page-actions">
            <Button variant="soft" onClick={() => setPlannerOpen(true)}><Sparkles style={{ width: 14 }} /> AI plan sprint</Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> New sprint</Button>
          </div>
        )}
      </div>

      {!data?.items.length && (
        <EmptyState icon={<GitBranch />} title="No sprints yet" sub="Create a sprint to time-box work, or ask the AI to plan one from your backlog."
          action={canManage ? <Button variant="primary" onClick={() => setPlannerOpen(true)}><Sparkles style={{ width: 14 }} /> AI plan sprint</Button> : undefined} />
      )}

      <div className="stack">
        {data?.items.map((s) => (
          <SprintCard key={s.id} sprint={s} canManage={canManage} expanded={expanded === s.id}
            onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
            onStart={() => update(s, { status: 'ACTIVE' }, `Started ${s.name}`)}
            onComplete={() => update(s, { status: 'COMPLETED' }, `Completed ${s.name}`)}
            onAdd={() => setAddTo(s)}
            onDelete={() => setDeleting(s)}
            onTasksChanged={mutate}
            onRemoveTask={(ids) => removeTasks(s, ids)}
          />
        ))}
      </div>

      {createOpen && <CreateSprintModal projectId={pid} onClose={() => setCreateOpen(false)} onSaved={mutate} />}
      {addTo && <AddTasksModal sprint={addTo} onClose={() => setAddTo(null)} onDone={mutate} />}
      <SprintPlannerModal open={plannerOpen} projectId={pid} onClose={() => setPlannerOpen(false)} onApplied={mutate} />
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (!deleting) return;
        try {
          await api.del(`/sprints/${deleting.id}`);
          toast.push('success', `Sprint "${deleting.name}" deleted — tasks returned to the backlog`);
          mutate();
        } catch (e: any) {
          toast.push('error', 'Delete failed', e?.message);
        }
      }} title={`Delete "${deleting?.name}"?`} message="Tasks in this sprint move back to the backlog. This cannot be undone." danger />
    </div>
  );
}

function SprintCard({ sprint, canManage, expanded, onToggle, onStart, onComplete, onAdd, onDelete, onTasksChanged, onRemoveTask }: {
  sprint: Sprint; canManage: boolean; expanded: boolean; onToggle: () => void;
  onStart: () => void; onComplete: () => void; onAdd: () => void; onDelete: () => void;
  onTasksChanged: () => void; onRemoveTask: (ids: string[]) => void;
}) {
  const { data: detail, isLoading } = useSWR<SprintDetail>(expanded ? `/sprints/${sprint.id}` : null, swrFetcher, { refreshInterval: 15000 });
  const st = sprint.stats;
  return (
    <section className="card">
      <div className="card-head" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <div className="flex" style={{ gap: 12 }}>
          <ChevronDown style={{ width: 16, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--text-3)' }} />
          <span className={sprint.status === 'ACTIVE' ? 'badge badge-accent' : sprint.status === 'COMPLETED' ? 'badge badge-green' : 'badge badge-soft'}>{sprint.status.replace('_', ' ')}</span>
          <div>
            <div style={{ fontWeight: 700 }}>{sprint.name}</div>
            {sprint.goal && <div className="row-sub">{sprint.goal}</div>}
          </div>
        </div>
        <div className="flex" style={{ gap: 16 }}>
          <div className="dim" style={{ fontSize: 12, textAlign: 'right' }}>
            {sprint.startDate ? fmtDate(sprint.startDate) : '—'} → {sprint.endDate ? fmtDate(sprint.endDate) : '—'}
          </div>
          {st && <Progress value={st.progress} label={`${st.done}/${st.total} done`} green={st.total > 0 && st.progress === 100} />}
          {canManage && (
            <Menu label="Sprint actions" button={<button className="icon-btn" style={{ width: 26, height: 26 }}><ChevronDown style={{ width: 14 }} /></button>}>
              {sprint.status === 'PLANNED' && <MenuItem onClick={onStart}><Play style={{ width: 14 }} /> Start sprint</MenuItem>}
              {sprint.status === 'ACTIVE' && <MenuItem onClick={onComplete}><CheckCircle2 style={{ width: 14 }} /> Complete sprint</MenuItem>}
              <MenuItem onClick={onAdd}><Plus style={{ width: 14 }} /> Add tasks from backlog</MenuItem>
              <div className="menu-sep" />
              <MenuItem className="danger" onClick={onDelete}><Trash2 style={{ width: 14 }} /> Delete sprint</MenuItem>
            </Menu>
          )}
        </div>
      </div>
      {expanded && (
        <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
          {isLoading && <Spinner label="Loading sprint…" />}
          {!isLoading && (!detail?.tasks?.length ? (
            <EmptyState title="No tasks in this sprint" sub="Add tasks from the project backlog." />
          ) : (
            <div className="row-list">
              {detail.tasks.map((t) => (
                <div key={t.id} className="flex" style={{ gap: 10, padding: '7px 2px', borderBottom: '1px solid var(--border)' }}>
                  <TaskStatusBadge status={t.status} compact />
                  <Link href={`/projects/${t.project}/tasks/${t.id}`} className="grow flex gap-sm" style={{ minWidth: 0 }}>
                    <span className="mono dim" style={{ fontSize: 11.5, flex: 'none' }}>{t.key}</span>
                    <span className="row-title">{t.title}</span>
                  </Link>
                  {t.dueDate && <DueChip due={t.dueDate} />}
                  <span className="chip">{t.estimatedHours ?? 0}h</span>
                  <Avatar user={t.assignee} size="sm" />
                  {canManage && <button className="mini-btn" onClick={() => onRemoveTask([t.id])} aria-label={`Remove ${t.key} from sprint`}>✕</button>}
                </div>
              ))}
            </div>
          ))}
          {detail && detail.stats && (
            <div className="flex mt" style={{ gap: 14, fontSize: 12.5, color: 'var(--text-2)' }}>
              <span>Velocity (est. hours done): {detail.stats.estimated}</span>
              <span>Remaining: {detail.stats.remainingEst}h</span>
              <span>Blocked: {detail.stats.blocked}</span>
              <span>In progress: {detail.stats.inProgress}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CreateSprintModal({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', goal: '', startDate: toLocalInput(new Date()), endDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (form.name.trim().length < 1) return setError('Name is required');
    setBusy(true);
    setError('');
    try {
      await api.post(`/projects/${projectId}/sprints`, {
        name: form.name.trim(),
        goal: form.goal,
        status: 'PLANNED',
        startDate: isoFromLocalInput(form.startDate),
        endDate: isoFromLocalInput(form.endDate),
      });
      toast.push('success', 'Sprint created');
      onClose();
      onSaved();
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New sprint" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create sprint'}</Button>
    </>}>
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sprint 14" autoFocus />
      </Field>
      <Field label="Goal">
        <Textarea rows={2} value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
      </Field>
      <div className="form-grid">
        <Field label="Start"><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
        <Field label="End"><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
      </div>
      {error && <div className="error-text">{error}</div>}
    </Modal>
  );
}

function AddTasksModal({ sprint, onClose, onDone }: { sprint: Sprint; onClose: () => void; onDone: () => void }) {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: Task[] }>(`/projects/${params.id}/tasks?parent=none&limit=200`, swrFetcher);
  const { data: inSprint } = useSWR<SprintDetail>(`/sprints/${sprint.id}`, swrFetcher);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const backlog = (data?.items ?? []).filter((t) => t.status !== 'DONE' && !inSprint?.tasks.some((s) => s.id === t.id));
  const submit = async () => {
    const ids = [...checked];
    if (!ids.length) return;
    setBusy(true);
    try {
      await api.post(`/sprints/${sprint.id}/tasks`, { taskIds: ids });
      toast.push('success', `Added ${ids.length} task${ids.length > 1 ? 's' : ''} to ${sprint.name}`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Add tasks to ${sprint.name}`} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={busy || checked.size === 0} onClick={submit}>{busy ? 'Adding…' : `Add ${checked.size || ''} task${checked.size === 1 ? '' : 's'}`}</Button>
    </>}>
      {isLoading && <Spinner label="Loading backlog…" />}
      {!isLoading && backlog.length === 0 && <EmptyState title="Backlog is empty" sub="No open tasks outside this sprint." />}
      {!isLoading && backlog.length > 0 && (
        <div className="row-list">
          {backlog.map((t) => (
            <label key={t.id} className="flex" style={{ gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked.has(t.id)} onChange={(e) => setChecked((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(t.id); else next.delete(t.id);
                return next;
              })} aria-label={`Add ${t.key}`} />
              <span className="mono dim" style={{ fontSize: 11.5, width: 62 }}>{t.key}</span>
              <span className="grow row-title">{t.title}</span>
              <span className="chip">{t.estimatedHours ?? 0}h</span>
              <Avatar user={t.assignee} size="sm" />
            </label>
          ))}
        </div>
      )}
      <div className="flex mt" style={{ justifyContent: 'space-between' }}>
        <span className="dim" style={{ fontSize: 12 }}>Showing {backlog.length} open backlog tasks</span>
        {backlog.length > 0 && <button className="mini-btn" onClick={() => mutate()}>refresh</button>}
      </div>
    </Modal>
  );
}
