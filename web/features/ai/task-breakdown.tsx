'use client';

import { useEffect, useState } from 'react';
import { Check, Layers, Loader2, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Field, Input, Modal, Select, Textarea, errMsg, useToast } from '@/components/ui';
import { cx } from '@/lib/format';
import type { Priority } from '@/lib/constants';

type GeneratedTask = { title: string; description: string; priority: Priority; complexity?: string | null; estimatedHours?: number | null; labels: string[] };
type Breakdown = { epic: string; summary: string; tasks: GeneratedTask[] };

export default function TaskBreakdownModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<Breakdown | null>(null);
  const [chosen, setChosen] = useState<boolean[]>([]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setChosen([]);
  }, [open]);

  if (!open) return null;

  const analyze = async () => {
    if (title.trim().length < 3) return setError('Describe the feature or goal you want to break down (≥3 characters)');
    setLoading(true);
    setError('');
    try {
      const res = await api.post<Breakdown>('/ai/task-breakdown', { title: title.trim(), description });
      setResult(res);
      setChosen(res.tasks.map(() => true));
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const createTasks = async () => {
    if (!projectId || !result) return;
    setCreating(true);
    try {
      let n = 0;
      for (let i = 0; i < result.tasks.length; i++) {
        if (!chosen[i]) continue;
        const t = result.tasks[i];
        await api.post(`/projects/${projectId}/tasks`, {
          title: t.title,
          description: t.description || `Part of epic: ${result.epic}`,
          priority: t.priority,
          estimatedHours: t.estimatedHours ?? undefined,
          labels: [...(t.labels ?? []), 'ai'].slice(0, 6),
        });
        n++;
      }
      toast.push('success', `Created ${n} task${n === 1 ? '' : 's'} in the project`);
      onClose();
    } catch (e: any) {
      toast.push('error', 'Could not create tasks', e?.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI task breakdown" wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {result && projectId && (
            <Button variant="primary" disabled={creating || !chosen.some(Boolean)} onClick={createTasks}>
              {creating ? <Loader2 className="spin" style={{ width: 14 }} /> : <Plus style={{ width: 14 }} />} Create {chosen.filter(Boolean).length || ''} selected task{chosen.filter(Boolean).length === 1 ? '' : 's'}
            </Button>
          )}
          {!result && (
            <Button variant="primary" disabled={loading} onClick={analyze}>
              {loading ? <Loader2 className="spin" style={{ width: 14 }} /> : <Sparkles style={{ width: 14 }} />} Break it down
            </Button>
          )}
        </>
      }
    >
      {!result ? (
        <div>
          <p className="muted mb" style={{ fontSize: 13 }}>
            Describe a goal or epic — the AI returns an ordered breakdown with priorities, estimates and labels that you review before creating.
          </p>
          <Field label="Epic / goal">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Implement Google & GitHub OAuth" autoFocus />
          </Field>
          <Field label="Context (optional)">
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Constraints, acceptance criteria, references…" />
          </Field>
          {error && <div className="error-text" role="alert">{error}</div>}
        </div>
      ) : (
        <div className="stack">
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <span className="badge badge-accent"><Layers style={{ width: 11 }} /> {result.epic}</span>
            <span className="badge badge-soft">{result.tasks.length} suggested tasks</span>
          </div>
          {result.summary && <p className="muted" style={{ fontSize: 13 }}>{result.summary}</p>}
          <div className="card">
            <div className="row-list">
              {result.tasks.map((t, i) => (
                <label key={i} className="flex" style={{ gap: 12, padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={chosen[i] ?? false} onChange={(e) => setChosen((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} aria-label={`Include ${t.title}`} style={{ marginTop: 3 }} />
                  <span className="mono dim" style={{ fontSize: 11, marginTop: 3, width: 26 }}>{i + 1}.</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                    {t.description && <div className="row-sub" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</div>}
                  </div>
                  <div className="flex" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
                    <span className={cx('badge', t.priority === 'URGENT' ? 'badge-red' : t.priority === 'HIGH' ? 'badge-amber' : t.priority === 'MEDIUM' ? 'badge-blue' : 'badge-soft')}>{t.priority.toLowerCase()}</span>
                    <span className="dim" style={{ fontSize: 11 }}>{t.complexity ? `complexity ${t.complexity}` : ''}{t.estimatedHours ? ` · ~${t.estimatedHours}h` : ''}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="dim" style={{ fontSize: 12, display: 'flex', gap: 6 }}>
            <Check style={{ width: 13 }} /> You only get what you tick — nothing is created until you confirm.
          </div>
        </div>
      )}
    </Modal>
  );
}
