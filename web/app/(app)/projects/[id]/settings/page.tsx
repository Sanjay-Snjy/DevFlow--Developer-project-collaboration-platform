'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, Archive, KeyRound, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { PRIORITIES, PROJECT_STATUSES, PROJECT_STATUS_LABEL, roleAtLeast } from '@/lib/constants';
import { useProject } from '@/features/project/project-shell';
import { Button, Field, Input, Select, Textarea, errMsg, useToast } from '@/components/ui';
import { isoFromLocalInput, toLocalInput } from '@/lib/format';

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const router = useRouter();
  const { project, mutate } = useProject(pid);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [keyDraft, setKeyDraft] = useState('');

  if (!project) return null;
  const canAdmin = roleAtLeast(project.myRole, 'ADMIN');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const value = (k: string, fallback = '') => (k in form ? form[k] : fallback);

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const k of ['name', 'description', 'status', 'priority'] as const) if (k in form) payload[k] = form[k];
      if ('startDate' in form) payload.startDate = isoFromLocalInput(form.startDate);
      if ('dueDate' in form) payload.dueDate = isoFromLocalInput(form.dueDate);
      if (keyDraft && keyDraft !== project.key) payload.key = keyDraft;
      await api.patch(`/projects/${pid}`, payload);
      toast.push('success', 'Project settings saved');
      setForm({});
      setKeyDraft('');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Could not save settings', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    try {
      await api.patch(`/projects/${pid}`, { status: project.status === 'ARCHIVED' ? 'PLANNING' : 'ARCHIVED' });
      toast.push('success', project.status === 'ARCHIVED' ? 'Project reactivated' : 'Project archived');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Project configuration for {project.key}.</p>
        </div>
      </div>

      <div className="stack">
        <section className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>General</h3>
          <Field label="Name">
            <Input value={value('name', project.name)} onChange={set('name')} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={value('description', project.description ?? '')} onChange={set('description')} />
          </Field>
          <div className="form-grid">
            <Field label="Status">
              <Select value={value('status', project.status)} onChange={set('status')}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={value('priority', project.priority ?? 'MEDIUM')} onChange={set('priority')}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </Select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Start date">
              <Input type="date" value={value('startDate', toLocalInput(project.startDate ?? null))} onChange={set('startDate')} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={value('dueDate', toLocalInput(project.dueDate ?? null))} onChange={set('dueDate')} />
            </Field>
          </div>
          <Button variant="primary" disabled={busy} onClick={save}><Save style={{ width: 14 }} /> Save changes</Button>
        </section>

        <section className="card card-pad">
          <h3 style={{ marginBottom: 14 }}><KeyRound style={{ width: 15, display: 'inline' }} /> Project key</h3>
          <p className="muted mb" style={{ fontSize: 13 }}>
            Used as the prefix for task and issue keys (e.g. DEV-101). Changing it renames every existing key. ADMIN required.
          </p>
          <div className="flex" style={{ maxWidth: 320 }}>
            <Input value={keyDraft || project.key} onChange={(e) => setKeyDraft(e.target.value.toUpperCase())} disabled={!canAdmin} aria-label="Project key" />
            {keyDraft && keyDraft !== project.key && (
              <Button size="sm" variant="soft" disabled={busy} onClick={save}>Rename</Button>
            )}
          </div>
          {!canAdmin && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Only workspace admins can change the key.</div>}
        </section>

        <section className="card card-pad">
          <h3 style={{ marginBottom: 10 }}><Archive style={{ width: 15, display: 'inline' }} /> Archive</h3>
          <p className="muted mb" style={{ fontSize: 13 }}>
            {project.status === 'ARCHIVED' ? 'This project is archived. Reactivate to continue working on it.' : 'Archiving hides the project from active lists while keeping all data.'}
          </p>
          <Button variant="soft" onClick={archive}>{project.status === 'ARCHIVED' ? 'Reactivate project' : 'Archive project'}</Button>
        </section>

        <section className="card card-pad">
          <h3 style={{ marginBottom: 10 }} className="danger"><AlertTriangle style={{ width: 15, display: 'inline', color: 'var(--red)' }} /> Danger zone</h3>
          <p className="muted mb" style={{ fontSize: 13 }}>Permanently delete this project, its tasks, issues, comments and sprints. There is no undo.</p>
          <Button variant="danger" onClick={async () => {
            if (confirm(`Delete ${project.key} "${project.name}" and everything in it? This cannot be undone.`)) {
              try {
                await api.del(`/projects/${pid}`);
                toast.push('success', 'Project deleted');
                router.push('/projects');
              } catch (e: any) {
                toast.push('error', 'Delete failed', e?.message);
              }
            }
          }}>Delete project</Button>
        </section>
      </div>
    </div>
  );
}
