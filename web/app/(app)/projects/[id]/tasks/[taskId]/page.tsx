'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Bell, BellOff, Clock3, Eye, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { PRIORITIES, roleAtLeast, TASK_STATUSES } from '@/lib/constants';
import type { TaskDetail, Task } from '@/lib/types';
import { useProject } from '@/features/project/project-shell';
import { useProjectOptions, LabelInput } from '@/features/tasks/task-form';
import TaskFormModal from '@/features/tasks/task-form';
import CommentSection from '@/features/comments/comment-section';
import { Avatar, Button, ErrorState, Input, Select, Spinner, Textarea, errMsg, useToast } from '@/components/ui';
import { DueChip, PriorityBadge, TaskStatusBadge } from '@/components/entities';
import { fmtDateTime, isoFromLocalInput, timeAgo, toLocalInput } from '@/lib/format';
import { useAuth } from '@/lib/hooks';

export default function TaskDetailPage() {
  const params = useParams<{ id: string; taskId: string }>();
  const pid = params.id;
  const tid = params.taskId;
  const { project, mutate: mutateProject } = useProject(pid);
  const { members, sprints } = useProjectOptions(pid);
  const { user } = useAuth();
  const toast = useToast();
  const { data: task, error, isLoading, mutate } = useSWR<TaskDetail>(tid ? `/tasks/${tid}` : null, swrFetcher, { refreshInterval: 12000 });
  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string[]>([]);
  const [editLabels, setEditLabels] = useState(false);
  const [hoursDraft, setHoursDraft] = useState('');
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isLoading || !task) return <Spinner label="Loading task…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const isManager = task.myRole ? roleAtLeast(task.myRole, 'MANAGER') : false;
  const isAssignee = task.assignee?.id === user?.id;
  const canEditAll = isManager;
  const canTouchStatus = isManager || isAssignee;

  const patch = async (payload: Record<string, unknown>, label?: string) => {
    setBusy(true);
    try {
      await api.patch(`/tasks/${tid}`, payload);
      toast.push('success', label ?? 'Task updated');
      await mutate();
      mutateProject();
      return true;
    } catch (e: any) {
      toast.push('error', 'Update failed', errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleWatch = async () => {
    try {
      await api.post(`/tasks/${tid}/watch`, { watching: !task.watching });
      toast.push('success', task.watching ? 'Unwatched' : 'Watching this task');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  const addSubtask = async (saved: Task) => {
    setNewSubOpen(false);
    toast.push('success', `${saved.key} added as subtask`);
    await mutate();
  };

  return (
    <div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="flex gap-sm mb">
            <span className="mono badge badge-accent">{task.key}</span>
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.parentTask && (
              <Link href={`/projects/${pid}/tasks/${task.parentTask.id}`} className="chip">
                subtask of {task.parentTask.key} · {task.parentTask.title}
              </Link>
            )}
            <span className="dim" style={{ fontSize: 12 }}>Updated {timeAgo(task.updatedAt)}</span>
          </div>
          {editTitle ? (
            <div className="flex">
              <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} autoFocus aria-label="Task title" />
              <Button size="sm" onClick={async () => {
                if (titleDraft.trim() && (await patch({ title: titleDraft.trim() }))) setEditTitle(false);
              }} disabled={busy || !titleDraft.trim()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditTitle(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex">
              <h1 className="page-title" style={{ overflowWrap: 'anywhere' }}>{task.title}</h1>
              {canEditAll && (
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => { setTitleDraft(task.title); setEditTitle(true); }} aria-label="Edit title"><Pencil style={{ width: 14 }} /></button>
              )}
            </div>
          )}
          <p className="page-sub">
            Reported by {task.reporter?.name ?? '—'} · Created {fmtDateTime(task.createdAt)}
            {task.completedAt && <> · Completed {timeAgo(task.completedAt)}</>}
          </p>
        </div>
        <div className="page-actions">
          <Button variant={task.watching ? 'soft' : 'ghost'} onClick={toggleWatch}>
            {task.watching ? <BellOff style={{ width: 14 }} /> : <Bell style={{ width: 14 }} />}
            {task.watching ? 'Watching' : 'Watch'}
          </Button>
          {isManager && (
            <Button variant="danger" onClick={async () => {
              if (confirm('Delete this task and its subtasks permanently?')) {
                try {
                  await api.del(`/tasks/${tid}`);
                  toast.push('success', `${task.key} deleted`);
                  window.history.back();
                } catch (e: any) {
                  toast.push('error', 'Delete failed', e?.message);
                }
              }
            }}>
              <Trash2 style={{ width: 14 }} /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>Description</h3>
              {canEditAll && !editingDesc && (
                <button className="mini-btn" onClick={() => { setDescDraft(task.description); setEditingDesc(true); }}><Pencil style={{ width: 12, marginRight: 3 }} /> Edit</button>
              )}
            </div>
            <div className="card-body">
              {editingDesc ? (
                <div className="stack">
                  <Textarea rows={7} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} autoFocus />
                  <div className="flex" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>Cancel</Button>
                    <Button size="sm" disabled={busy} onClick={async () => {
                      if (await patch({ description: descDraft })) setEditingDesc(false);
                    }}>Save description</Button>
                  </div>
                </div>
              ) : task.description ? (
                <div className="comment-content">{task.description}</div>
              ) : (
                <div className="dim" style={{ fontSize: 13 }}>No description provided.</div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Subtasks ({task.subtasks.length})</h3>
              {isManager && <Button size="sm" onClick={() => setNewSubOpen(true)}><Plus style={{ width: 13 }} /> Add subtask</Button>}
            </div>
            <div className="card-body" style={{ padding: 6 }}>
              {task.subtasks.length === 0 ? (
                <div className="dim" style={{ textAlign: 'center', padding: '18px 0', fontSize: 13 }}>
                  Break this task into smaller pieces. <ListTodo style={{ width: 13, display: 'inline' }} />
                </div>
              ) : (
                <div className="row-list">
                  {task.subtasks.map((s) => (
                    <div key={s.id} className="flex" style={{ gap: 8, padding: '8px 8px', borderBottom: '1px solid var(--border)' }}>
                      <TaskStatusBadge status={s.status} compact />
                      <Link href={`/projects/${pid}/tasks/${s.id}`} className="grow row-title">{s.title}</Link>
                      {s.dueDate && <DueChip due={s.dueDate} />}
                      <Avatar user={s.assignee} size="sm" />
                      <select className="select btn-sm" style={{ width: 'auto', minWidth: 100 }} value={s.status}
                        onChange={async (e) => {
                          try {
                            await api.patch(`/tasks/${s.id}`, { status: e.target.value });
                            mutate();
                          } catch (err: any) {
                            toast.push('error', 'Update failed', err?.message);
                          }
                        }}
                        disabled={!isManager && s.assignee?.id !== user?.id}
                        aria-label={`Change ${s.key} status`}>
                        {TASK_STATUSES.map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Comments ({task.comments.length})</h3>
            </div>
            <div className="card-body">
              <CommentSection
                kind="task"
                subjectId={tid}
                members={members}
                canComment={Boolean(project)}
                comments={task.comments}
                onChanged={() => mutate()}
              />
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card card-pad">
            <div className="section-title">Details</div>
            <div className="stack" style={{ gap: 10 }}>
              <RailField label="Status">
                <Select value={task.status} disabled={!canTouchStatus} onChange={(e) => patch({ status: e.target.value }, `${task.key} → ${e.target.value.replace('_', ' ')}`)}>
                  {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </Select>
              </RailField>
              <RailField label="Assignee">
                {canEditAll ? (
                  <Select value={task.assignee?.id ?? ''} onChange={(e) => patch({ assignee: e.target.value || null }, e.target.value ? 'Task assigned' : 'Unassigned')}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>)}
                  </Select>
                ) : (
                  <div className="flex"><Avatar user={task.assignee} size="sm" /> <span>{task.assignee?.name ?? 'Unassigned'}</span></div>
                )}
              </RailField>
              <RailField label="Priority">
                {canEditAll ? (
                  <Select value={task.priority} onChange={(e) => patch({ priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                  </Select>
                ) : (
                  <PriorityBadge priority={task.priority} />
                )}
              </RailField>
              <RailField label="Due date">
                {canEditAll ? (
                  <Input type="date" value={toLocalInput(task.dueDate ?? null)} onChange={(e) => patch({ dueDate: isoFromLocalInput(e.target.value) })} />
                ) : (
                  <DueChip due={task.dueDate} />
                )}
              </RailField>
              <RailField label="Sprint">
                {canEditAll ? (
                  <Select value={task.sprint ?? ''} onChange={(e) => patch({ sprint: e.target.value || null })}>
                    <option value="">No sprint</option>
                    {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                ) : (
                  <span className="dim">{sprints.find((s) => s.id === task.sprint)?.name ?? 'No sprint'}</span>
                )}
              </RailField>
              <RailField label="Estimate (hrs)">
                <div className="flex">
                  {canEditAll ? (
                    <>
                      <Input type="number" min={0} step={0.5} style={{ width: 86 }} value={hoursDraft === '' ? (task.estimatedHours ?? 0) : hoursDraft}
                        onChange={(e) => setHoursDraft(e.target.value)}
                        onBlur={async () => {
                          const n = Number(hoursDraft);
                          if (!Number.isNaN(n) && n >= 0 && n !== task.estimatedHours) await patch({ estimatedHours: n }, 'Estimate updated');
                          setHoursDraft('');
                        }}
                        aria-label="Estimated hours" />
                    </>
                  ) : (
                    <span>{task.estimatedHours ?? 0}</span>
                  )}
                  <Clock3 style={{ width: 13, color: 'var(--text-3)' }} />
                </div>
              </RailField>
              <RailField label="Actual (hrs)">
                <div className="flex">
                  <span>{task.actualHours ?? 0}</span>
                  {canTouchStatus && (
                    <button className="mini-btn" onClick={async () => {
                      const raw = prompt('Add hours logged', '1');
                      const n = Number(raw);
                      if (raw !== null && !Number.isNaN(n) && n >= 0) await patch({ actualHours: (task.actualHours ?? 0) + n }, 'Time logged');
                    }}>log</button>
                  )}
                </div>
              </RailField>
            </div>
          </section>

          <section className="card card-pad">
            <div className="section-title">Labels</div>
            {editLabels && canEditAll ? (
              <div className="stack">
                <LabelInput value={labelDraft} onChange={setLabelDraft} />
                <div className="flex">
                  <Button size="sm" disabled={busy} onClick={async () => {
                    if (await patch({ labels: labelDraft })) { setEditLabels(false); setLabelDraft([]); }
                  }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditLabels(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex" style={{ flexWrap: 'wrap', gap: 5 }}>
                {task.labels.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No labels</span>}
                {task.labels.map((l) => <span className="chip" key={l}>{l}</span>)}
                {canEditAll && (
                  <button className="mini-btn" onClick={() => { setLabelDraft(task.labels); setEditLabels(true); }}><Pencil style={{ width: 12, marginRight: 3 }} /> Edit</button>
                )}
              </div>
            )}
          </section>

          <section className="card card-pad">
            <div className="section-title">Watchers ({task.watchers.length})</div>
            <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>
              {task.watchers.length === 0 && <span className="dim" style={{ fontSize: 12 }}>Nobody is watching</span>}
              {task.watchers.map((w) => (
                <span className="flex gap-sm chip" key={w.id}><Eye style={{ width: 12 }} /> {w.name}</span>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <TaskFormModal projectId={pid} open={newSubOpen} parentId={tid} onClose={() => setNewSubOpen(false)} onSaved={addSubtask} />
    </div>
  );
}

function RailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
