'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES } from '@/lib/constants';
import type { Issue, Member } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea, errMsg, useToast } from '@/components/ui';
import { LabelInput, useProjectOptions } from '@/features/tasks/task-form';

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  issue?: Issue | null;
};

const INITIAL = {
  title: '',
  description: '',
  type: 'BUG',
  priority: 'MEDIUM',
  severity: 'MEDIUM',
  status: 'OPEN',
  assignee: '',
  labels: [] as string[],
  environment: '',
  stepsToReproduce: '',
  expectedResult: '',
  actualResult: '',
};

export default function IssueFormModal({ projectId, open, onClose, onSaved, issue }: Props) {
  const { members, loaded } = useProjectOptions(projectId);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(INITIAL);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      title: issue?.title ?? '',
      description: issue?.description ?? '',
      type: issue?.type ?? 'BUG',
      priority: issue?.priority ?? 'MEDIUM',
      severity: issue?.severity ?? 'MEDIUM',
      status: issue?.status ?? 'OPEN',
      assignee: issue?.assignee?.id ?? '',
      labels: issue?.labels ?? [],
      environment: issue?.environment ?? '',
      stepsToReproduce: issue?.stepsToReproduce ?? '',
      expectedResult: issue?.expectedResult ?? '',
      actualResult: issue?.actualResult ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, issue]);

  if (!open) return null;

  const set = (k: keyof typeof INITIAL, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return setError('Title is required');
    setBusy(true);
    setError('');
    const payload = { ...form, title: form.title.trim(), assignee: form.assignee || null };
    try {
      if (issue) await api.patch(`/issues/${issue.id}`, payload);
      else await api.post(`/projects/${projectId}/issues`, payload);
      toast.push('success', issue ? `${issue.key} updated` : 'Issue created');
      onClose();
      onSaved();
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
      title={issue ? `Edit ${issue.key}` : 'Report an issue'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !form.title.trim()} onClick={submit}>
            {busy ? 'Saving…' : issue ? 'Save changes' : 'Create issue'}
          </Button>
        </>
      }
    >
      {!loaded && <div className="skeleton" style={{ height: 220 }} />}
      {loaded && (
        <div>
          <Field label="Title">
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Summarize the problem or request" autoFocus />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What happened? Context for the reader…" />
          </Field>
          <div className="form-grid">
            <Field label="Type">
              <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={form.assignee} onChange={(e) => set('assignee', e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m: Member) => <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>)}
              </Select>
            </Field>
            <Field label="Environment">
              <Input value={form.environment} onChange={(e) => set('environment', e.target.value)} placeholder="Browser, OS, app version…" />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Steps to reproduce">
              <Textarea rows={3} value={form.stepsToReproduce} onChange={(e) => set('stepsToReproduce', e.target.value)} placeholder={'1. Go to…\n2. Click…\n3. See error'} />
            </Field>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Field label="Expected result">
                <Textarea rows={1} value={form.expectedResult} onChange={(e) => set('expectedResult', e.target.value)} />
              </Field>
              <Field label="Actual result">
                <Textarea rows={1} value={form.actualResult} onChange={(e) => set('actualResult', e.target.value)} />
              </Field>
            </div>
          </div>
          <Field label="Labels">
            <LabelInput value={form.labels} onChange={(labels) => set('labels', labels)} />
          </Field>
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
