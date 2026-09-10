'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { MessageSquare, MoreHorizontal, Pencil, Plus, Swords, Trash2, UserRound } from 'lucide-react';
import { api, qs, swrFetcher } from '@/lib/api';
import { PRIORITIES, TASK_STATUSES, roleAtLeast, STATUS_META, type TaskStatus } from '@/lib/constants';
import type { Task } from '@/lib/types';
import TaskFormModal, { useProjectOptions } from '@/features/tasks/task-form';
import { Avatar, Button, Confirm, EmptyState, ErrorState, Menu, MenuItem, Select, Spinner, useToast } from '@/components/ui';
import { PriorityBadge, TaskStatusBadge } from '@/components/entities';
import { cx, timeAgo } from '@/lib/format';
import { useProject } from '@/features/project/project-shell';

type BoardResp = { columns: Array<{ status: TaskStatus; tasks: Task[] }> };
type Filters = { assignee: string; priority: string; label: string; q: string };

export default function BoardView({ projectId, heightLimit }: { projectId: string; heightLimit?: string }) {
  const { project, mutate: mutateProject } = useProject(projectId);
  const { members } = useProjectOptions(projectId);
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ assignee: '', priority: '', label: '', q: '' });
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const query = useMemo(
    () => qs({ assignee: filters.assignee, priority: filters.priority, label: filters.label, q: filters.q }),
    [filters]
  );
  const { data, error, isLoading, mutate } = useSWR<BoardResp>(projectId ? `/projects/${projectId}/tasks/board${query}` : null, swrFetcher, { refreshInterval: 15000 });

  const canManage = project ? roleAtLeast(project.myRole, 'MANAGER') : false;
  const labels = useMemo(() => [...new Set((data?.columns ?? []).flatMap((c) => c.tasks.flatMap((t) => t.labels ?? [])))].slice(0, 30), [data]);

  const dropIndex = (status: TaskStatus, e: React.DragEvent): number => {
    const el = colRefs.current[status];
    if (!el) return 0;
    const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-task-id]'));
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  };

  const onDragOver = (status: TaskStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-task-id]')) return;
    setOver({ status, index: dropIndex(status, e) });
  };

  const move = async (taskId: string, status: TaskStatus) => {
    if (!over) return;
    setBusy(true);
    try {
      await api.post(`/tasks/${taskId}/move`, { status, toIndex: over.index });
      toast.push('success', `Task moved to ${STATUS_META[status].label}`);
      await mutate();
      await mutateProject();
    } catch (e: any) {
      toast.push('error', 'Move failed', e?.message);
      await mutate();
    } finally {
      setBusy(false);
      setDragId(null);
      setOver(null);
    }
  };

  const quickAssign = async (task: Task, assigneeId: string) => {
    try {
      await api.patch(`/tasks/${task.id}`, { assignee: assigneeId || null });
      toast.push('success', assigneeId ? 'Assigned' : 'Unassigned');
      await mutate();
    } catch (e: any) {
      toast.push('error', 'Assignment failed', e?.message);
    }
  };

  const quickDelete = async () => {
    if (!deleting) return;
    try {
      await api.del(`/tasks/${deleting.id}`);
      toast.push('success', `${deleting.key} deleted`);
      await mutate();
    } catch (e: any) {
      toast.push('error', 'Delete failed', e?.message);
    }
  };

  if (isLoading && !data) return <Spinner label="Loading board…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const filterActive = Boolean(filters.q || filters.assignee || filters.priority || filters.label);

  return (
    <div>
      <div className="filter-bar">
        <div className="flex grow" style={{ flex: 1, minWidth: 200 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Search board…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            aria-label="Search board"
          />
        </div>
        <Select value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))} aria-label="Assignee filter">
          <option value="">All assignees</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} aria-label="Priority filter">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select value={filters.label} onChange={(e) => setFilters((f) => ({ ...f, label: e.target.value }))} aria-label="Label filter">
          <option value="">All labels</option>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        {filterActive && <Button variant="ghost" size="sm" onClick={() => setFilters({ assignee: '', priority: '', label: '', q: '' })}>Clear</Button>}
      </div>

      {data && data.columns.every((c) => c.tasks.length === 0) && !filterActive ? (
        <EmptyState
          icon={<Swords />}
          title="This board is empty"
          sub="Create the first task, or drag cards between the columns above."
          action={canManage ? <Button variant="primary" onClick={() => setCreateStatus('TODO')}><Plus /> New task</Button> : undefined}
        />
      ) : (
        <div className="board-scroll">
          <div className="board">
            {data?.columns.map((col) => (
              <div
                className="board-col"
                key={col.status}
                style={heightLimit ? { maxHeight: heightLimit } : undefined}
                onDragOver={onDragOver(col.status)}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain') || dragId;
                  if (id) move(id, col.status);
                  else setOver(null);
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
                }}
              >
                <div className="board-col-head">
                  <TaskStatusBadge status={col.status} compact />
                  {STATUS_META[col.status].label}
                  <span className="board-col-count">{col.tasks.length}</span>
                  {canManage && (
                    <button className="mini-btn" style={{ marginLeft: 'auto' }} onClick={() => setCreateStatus(col.status)} aria-label={`New task in ${col.status}`}>
                      <Plus style={{ width: 13 }} />
                    </button>
                  )}
                </div>
                <div
                  className={cx('board-col-body', over?.status === col.status && 'drop')}
                  ref={(el) => { colRefs.current[col.status] = el; }}
                >
                  {col.tasks.map((t) => (
                    <div
                      key={t.id}
                      data-task-id={t.id}
                      className={cx('task-card', dragId === t.id && 'dragging')}
                      style={{ position: 'relative' }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragId(t.id);
                      }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                    >
                      <Link href={`/projects/${projectId}/tasks/${t.id}`} style={{ display: 'block' }}>
                        <div className="flex" style={{ justifyContent: 'space-between' }}>
                          <span className="tc-key">{t.key}</span>
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <div className="tc-title">{t.title}</div>
                        {t.labels.length > 0 && (
                          <div className="tc-tags">
                            {t.labels.slice(0, 3).map((l) => <span className="chip" key={l} style={{ fontSize: 10.5 }}>{l}</span>)}
                          </div>
                        )}
                        <div className="tc-foot">
                          <span className="tc-icons">
                            {t.commentCount ? (<span><MessageSquare style={{ width: 11, display: 'inline' }} /> {t.commentCount}</span>) : null}
                            {t.subtaskCount ? (<span><Swords style={{ width: 11, display: 'inline' }} /> {t.subtaskCount}</span>) : null}
                          </span>
                          <span className="flex gap-sm">
                            {t.dueDate && <span className="dim" style={{ fontSize: 10.5 }}>{timeAgo(t.dueDate)}</span>}
                            <Avatar user={t.assignee} size="sm" className="tc-avatar" />
                          </span>
                        </div>
                      </Link>
                      {(canManage) && (
                        <Menu
                          align="right"
                          label={`Actions for ${t.key}`}
                          button={<button className="mini-btn" style={{ position: 'absolute', right: 6, top: 6 }} onClick={(e) => e.stopPropagation()}><MoreHorizontal style={{ width: 13 }} /></button>}
                        >
                          <MenuItem onClick={() => { setEditing(t); }}><Pencil /> Edit</MenuItem>
                          <div className="menu-label">Assignee</div>
                          <MenuItem onClick={() => quickAssign(t, '')}><UserRound style={{ width: 14 }} /> Unassigned</MenuItem>
                          {members.map((m) => (
                            <MenuItem key={m.id} onClick={() => quickAssign(t, m.id)}><Avatar user={m} size="sm" /> {m.name}</MenuItem>
                          ))}
                          {canManage && (
                            <MenuItem className="danger" onClick={() => setDeleting(t)}><Trash2 /> Delete</MenuItem>
                          )}
                        </Menu>
                      )}
                    </div>
                  ))}
                  {over?.status === col.status && <div className="chip" style={{ borderStyle: 'dashed', opacity: 0.7 }}>drop here</div>}
                  {!col.tasks.length && <div className="dim" style={{ fontSize: 12, textAlign: 'center', padding: 18 }}>No tasks</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {busy && <div className="dim" style={{ textAlign: 'center', fontSize: 12 }}>Syncing board…</div>}

      <TaskFormModal projectId={projectId} open={Boolean(createStatus || editing)} task={editing} defaultStatus={createStatus ?? undefined}
        onClose={() => { setCreateStatus(null); setEditing(null); }}
        onSaved={async () => { await mutate(); await mutateProject(); }} />
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={quickDelete} title={`Delete ${deleting?.key}?`} message="This permanently deletes the task and its subtasks." danger />
    </div>
  );
}
