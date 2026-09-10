'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { PRIORITIES, TASK_STATUSES } from '@/lib/constants';
import type { Member, Sprint, Task } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea, errMsg, useToast } from '@/components/ui';
import { isoFromLocalInput, toLocalInput } from '@/lib/format';

export function useProjectOptions(projectId: string) {
  const { data: membersData } = useSWR<{ members: Member[] }>(projectId ? `/projects/${projectId}/members` : null, swrFetcher);
  const { data: sprintsData } = useSWR<{ items: Sprint[] }>(projectId ? `/projects/${projectId}/sprints` : null, swrFetcher);
  return { members: membersData?.members ?? [], sprints: sprintsData?.items ?? [], loaded: Boolean(membersData && sprintsData) };
}

export function LabelInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim().replace(/,$/, '');
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {value.map((l) => (
          <span className="chip" key={l}>
            {l}
            <button type="button" aria-label={`Remove ${l}`} onClick={() => onChange(value.filter((x) => x !== l))} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'inline-flex', padding: 0 }}>
              <X style={{ width: 10 }} />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder="Add label + Enter"
      />
    </div>
  );
}

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  task?: Task | null;
  defaultStatus?: string;
  parentId?: string | null;
};

export default function TaskFormModal({ projectId, open, onClose, onSaved, task, defaultStatus, parentId }: Props) {
  const { members, sprints, loaded } = useProjectOptions(projectId);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    assignee: '',
    labels: [] as string[],
    dueDate: '',
    estimatedHours: '',
    sprint: '',
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? defaultStatus ?? 'TODO',
      priority: task?.priority ?? 'MEDIUM',
      assignee: task?.assignee?.id ?? '',
      labels: task?.labels ?? [],
      dueDate: toLocalInput(task?.dueDate ?? null),
      estimatedHours: task?.estimatedHours ? String(task.estimatedHours) : '',
      sprint: task?.sprint ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  if (!open) return null;

  const submit = async () => {
    if (!form.title.trim()) return setError('Title is required');
    setBusy(true);
    setError('');
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description,
      status: form.status,
      priority: form.priority,
      labels: form.labels,
      dueDate: isoFromLocalInput(form.dueDate),
      estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
      sprint: form.sprint || null,
    };
    if (task) {
      payload.assignee = form.assignee || null;
    } else {
      payload.assignee = form.assignee || null;
    }
    try {
      const saved = task
        ? await api.patch<Task>(`/tasks/${task.id}`, payload)
        : await api.post<Task>(`/projects/${projectId}/tasks`, { ...payload, parent: parentId ?? null });
      toast.push('success', task ? `${saved.key} updated` : `${saved.key} created`);
      onClose();
      onSaved(saved);
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? `Edit ${task.key}` : parentId ? 'New subtask' : 'New task'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !form.title.trim()} onClick={submit}>
            {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      {!loaded && <div className="skeleton" style={{ height: 200 }} />}
      {loaded && (
        <div>
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" autoFocus />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} placeholder="Details, acceptance criteria…" />
          </Field>
          <div className="form-grid">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>)}
              </Select>
            </Field>
            <Field label="Sprint">
              <Select value={form.sprint} onChange={(e) => setForm((f) => ({ ...f, sprint: e.target.value }))}>
                <option value="">No sprint</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Due date"><Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field>
            <Field label="Estimated hours">
              <Input type="number" min={0} step={0.5} value={form.estimatedHours} onChange={(e) => setForm((f) => ({ ...f, estimatedHours: e.target.value }))} placeholder="0" />
            </Field>
          </div>
          <Field label="Labels">
            <LabelInput value={form.labels} onChange={(labels) => setForm((f) => ({ ...f, labels }))} />
          </Field>
          {error && <div className="error-text mb">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
