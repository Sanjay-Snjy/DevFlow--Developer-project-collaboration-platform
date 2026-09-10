'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronDown, ChevronLeft, ChevronRight, ListTodo, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { api, qs, swrFetcher } from '@/lib/api';
import { roleAtLeast } from '@/lib/constants';
import type { Task } from '@/lib/types';
import TaskFormModal, { useProjectOptions } from '@/features/tasks/task-form';
import TaskBreakdownModal from '@/features/ai/task-breakdown';
import { useProject } from '@/features/project/project-shell';
import { Avatar, Button, Confirm, EmptyState, ErrorState, Input, Menu, MenuItem, Select, Spinner, useToast } from '@/components/ui';
import { DueChip, TaskStatusBadge } from '@/components/entities';
import { cx, timeAgo } from '@/lib/format';
import { TASK_STATUSES } from '@/lib/constants';

type TaskListResp = { items: Task[]; total: number; page: number; limit: number };

export default function TasksPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const { project } = useProject(pid);
  const { members, sprints } = useProjectOptions(pid);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [label, setLabel] = useState('');
  const [sprint, setSprint] = useState('');
  const [includeSubtasks, setIncludeSubtasks] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const toast = useToast();

  const query = useMemo(
    () => qs({ page, limit: 40, q, status, assignee, priority, label, sprint, parent: includeSubtasks ? '' : 'none', sort: 'order' }),
    [page, q, status, assignee, priority, label, sprint, includeSubtasks]
  );
  const { data, error, isLoading, mutate } = useSWR<TaskListResp>(pid ? `/projects/${pid}/tasks${query}` : null, swrFetcher, { refreshInterval: 15000 });

  const canManage = project ? roleAtLeast(project.myRole, 'MANAGER') : false;
  const labels = useMemo(() => [...new Set((data?.items ?? []).flatMap((t) => t.labels ?? []))].slice(0, 40), [data]);

  const quickStatus = async (t: Task, next: string) => {
    try {
      await api.patch(`/tasks/${t.id}`, { status: next });
      toast.push('success', `${t.key} → ${next.replace('_', ' ')}`);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Status change failed', e?.message);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.del(`/tasks/${deleting.id}`);
      toast.push('success', `${deleting.key} deleted`);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Delete failed', e?.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">{data?.total ?? '—'} tasks in {project?.key ?? ''}</p>
        </div>
        <div className="page-actions">
          {canManage && <Button variant="soft" onClick={() => setAiOpen(true)}><Sparkles style={{ width: 14 }} /> AI breakdown</Button>}
          {canManage && <Button variant="primary" onClick={() => { setEditing(null); setCreateOpen(true); }}><Plus /> New task</Button>}
        </div>
      </div>

      <div className="filter-bar">
        <div className="flex" style={{ flex: 1, minWidth: 200 }}>
          <Search style={{ width: 15, color: 'var(--text-3)', marginLeft: 10 }} />
          <Input placeholder="Search tasks…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 4 }} aria-label="Search tasks" />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <Select value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }} aria-label="Assignee filter">
          <option value="">All assignees</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} aria-label="Priority filter">
          <option value="">All priorities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select value={sprint} onChange={(e) => { setSprint(e.target.value); setPage(1); }} aria-label="Sprint filter">
          <option value="">All sprints</option>
          <option value="none">No sprint</option>
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={label} onChange={(e) => { setLabel(e.target.value); setPage(1); }} aria-label="Label filter">
          <option value="">All labels</option>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        <label className="check-row btn-ghost" style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeSubtasks} onChange={(e) => setIncludeSubtasks(e.target.checked)} /> subtasks
        </label>
      </div>

      {isLoading && <Spinner label="Loading tasks…" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!isLoading && !error && data && data.items.length === 0 && (
        <EmptyState
          icon={<ListTodo />}
          title={q || status || assignee ? 'No tasks match your filters' : 'No tasks yet'}
          sub={q || status || assignee ? 'Try removing filters.' : 'Create the first task to get going.'}
          action={canManage && !q && !status ? <Button variant="primary" onClick={() => { setEditing(null); setCreateOpen(true); }}><Plus /> New task</Button> : undefined}
        />
      )}

      {!isLoading && !error && data && data.items.length > 0 && (
        <div className="card">
          <div className="row-list">
            {data.items.map((t) => (
              <div key={t.id} className="flex" style={{ gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                <TaskStatusBadge status={t.status} compact />
                <Link href={`/projects/${pid}/tasks/${t.id}`} className="grow flex" style={{ minWidth: 0, gap: 10 }}>
                  <span className="mono dim" style={{ fontSize: 11.5, flex: 'none' }}>{t.key}</span>
                  <span className="row-title">{t.title}</span>
                  {t.parent && <span className="chip">subtask</span>}
                </Link>
                {t.dueDate && <DueChip due={t.dueDate} />}
                <div className="flex gap-sm">
                  {t.labels?.slice(0, 3).map((l) => <span className="chip" key={l}>{l}</span>)}
                </div>
                <span className="dim" style={{ fontSize: 11.5 }}>{timeAgo(t.updatedAt)}</span>
                <Avatar user={t.assignee} size="sm" />
                <select className="select btn-sm" style={{ width: 'auto', minWidth: 105 }} value={t.status} onChange={(e) => quickStatus(t, e.target.value)} aria-label={`Change ${t.key} status`}>
                  {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                {(canManage || t.assignee?.id === (t.assignee && undefined)) && (
                  <Menu
                    label={`Actions for ${t.key}`}
                    button={<button className="icon-btn" style={{ width: 28, height: 28 }}><ChevronDown style={{ width: 15 }} /></button>}
                  >
                    <MenuItem onClick={() => { setEditing(t); setCreateOpen(true); }}><Pencil /> Edit</MenuItem>
                    {canManage && <MenuItem className="danger" onClick={() => setDeleting(t)}><Trash2 /> Delete</MenuItem>}
                  </Menu>
                )}
              </div>
            ))}
          </div>
          {(data?.total ?? 0) > data.items.length && (
            <div className="flex" style={{ justifyContent: 'space-between', padding: 12 }}>
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft style={{ width: 14 }} /> Previous</Button>
              <span className="dim" style={{ fontSize: 12.5 }}>Page {data.page} · {data.total} tasks</span>
              <Button variant="ghost" size="sm" disabled={data.items.length < data.limit} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight style={{ width: 14 }} /></Button>
            </div>
          )}
        </div>
      )}

      <TaskFormModal projectId={pid} open={createOpen} task={editing} onClose={() => { setCreateOpen(false); setEditing(null); }} onSaved={() => mutate()} />
      <TaskBreakdownModal open={aiOpen} onClose={() => setAiOpen(false)} projectId={pid} />
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={remove} title={`Delete ${deleting?.key}?`} message={`"${deleting?.title}" and its subtasks will be permanently deleted.`} danger />
    </div>
  );
}
