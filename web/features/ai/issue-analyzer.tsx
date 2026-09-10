'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Bug, Check, ListChecks, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { Issue } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea, errMsg, useToast } from '@/components/ui';
import { cx } from '@/lib/format';

type Analysis = {
  possibleCauses: string[];
  severity: string;
  suggestedPriority: string;
  suggestedLabels: string[];
  debuggingSteps: string[];
  suggestedTasks: Array<{ title: string; description: string }>;
};

const SEVERITY_CLS: Record<string, string> = { CRITICAL: 'badge-red', HIGH: 'badge-amber', MEDIUM: 'badge-blue', LOW: 'badge-soft' };
const PRIO_CLS: Record<string, string> = { URGENT: 'badge-red', HIGH: 'badge-amber', MEDIUM: 'badge-blue', LOW: 'badge-soft' };

export default function IssueAnalyzerModal({
  open,
  onClose,
  projectId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  initial?: Issue | null;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', stepsToReproduce: '', expectedResult: '', actualResult: '', environment: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setAnalysis(null);
    setForm({
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      stepsToReproduce: initial?.stepsToReproduce ?? '',
      expectedResult: initial?.expectedResult ?? '',
      actualResult: initial?.actualResult ?? '',
      environment: initial?.environment ?? '',
    });
  }, [open, initial]);

  if (!open) return null;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const analyze = async () => {
    if (form.title.trim().length < 3 || form.description.trim().length < 3) {
      return setError('A title and a description (≥3 chars) are required for analysis');
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<Analysis>('/ai/analyze-issue', {
        title: form.title.trim(),
        description: form.description.trim(),
        stepsToReproduce: form.stepsToReproduce,
        expectedResult: form.expectedResult,
        actualResult: form.actualResult,
        environment: form.environment,
      });
      setAnalysis(res);
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const createTasks = async () => {
    if (!projectId || !analysis) return;
    setCreating(true);
    try {
      let n = 0;
      for (const t of analysis.suggestedTasks) {
        await api.post(`/projects/${projectId}/tasks`, {
          title: t.title,
          description: t.description,
          priority: analysis.suggestedPriority,
          labels: [...analysis.suggestedLabels, 'ai'].slice(0, 6),
        });
        n++;
      }
      toast.push('success', `Created ${n} task${n === 1 ? '' : 's'} from the analysis`);
      setAnalysis(null);
      onClose();
    } catch (e: any) {
      toast.push('error', 'Could not create tasks', e?.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI issue analyzer" wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {analysis && projectId && (
            <Button variant="primary" disabled={creating || !analysis.suggestedTasks.length} onClick={createTasks}>
              {creating ? <Loader2 className="spin" style={{ width: 14 }} /> : <ListChecks style={{ width: 14 }} />} Create {analysis.suggestedTasks.length || ''} suggested task{analysis.suggestedTasks.length === 1 ? '' : 's'}
            </Button>
          )}
          {!analysis && (
            <Button variant="primary" disabled={loading} onClick={analyze}>
              {loading ? <Loader2 className="spin" style={{ width: 14 }} /> : <Sparkles style={{ width: 14 }} />} Analyze issue
            </Button>
          )}
        </>
      }
    >
      {!analysis ? (
        <div>
          <p className="muted mb" style={{ fontSize: 13 }}>Paste a bug report and the AI will suggest causes, severity, debugging steps and follow-up tasks.</p>
          <Field label="Title">
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Users randomly get logged out" />
          </Field>
          <Field label="Description">
            <Textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe what is happening…" />
          </Field>
          <div className="form-grid">
            <Field label="Steps to reproduce">
              <Textarea rows={3} value={form.stepsToReproduce} onChange={(e) => set('stepsToReproduce', e.target.value)} placeholder={'1. …\n2. …'} />
            </Field>
            <div>
              <Field label="Expected result">
                <Textarea rows={1} value={form.expectedResult} onChange={(e) => set('expectedResult', e.target.value)} />
              </Field>
              <Field label="Actual result">
                <Textarea rows={1} value={form.actualResult} onChange={(e) => set('actualResult', e.target.value)} />
              </Field>
            </div>
          </div>
          <Field label="Environment (optional)">
            <Input value={form.environment} onChange={(e) => set('environment', e.target.value)} placeholder="Browser, OS, version…" />
          </Field>
          {error && <div className="error-text" role="alert">{error}</div>}
        </div>
      ) : (
        <div className="stack">
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <span className={cx('badge', SEVERITY_CLS[analysis.severity] ?? 'badge-soft')}><AlertTriangle style={{ width: 11 }} /> Severity: {analysis.severity.toLowerCase()}</span>
            <span className={cx('badge', PRIO_CLS[analysis.suggestedPriority] ?? 'badge-soft')}>Suggested priority: {analysis.suggestedPriority.toLowerCase()}</span>
            {analysis.suggestedLabels.map((l) => <span className="chip" key={l}>{l}</span>)}
          </div>

          <section>
            <div className="section-title">Possible causes</div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {analysis.possibleCauses.map((c, i) => <li key={i} style={{ fontSize: 13.5 }}>{c}</li>)}
            </ul>
          </section>

          <section>
            <div className="section-title">Suggested debugging steps</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {analysis.debuggingSteps.map((s, i) => <li key={i} style={{ fontSize: 13.5 }}>{s}</li>)}
            </ol>
          </section>

          {analysis.suggestedTasks.length > 0 && (
            <section>
              <div className="section-title">Suggested follow-up tasks</div>
              <div className="card">
                <div className="row-list">
                  {analysis.suggestedTasks.map((t, i) => (
                    <div key={i} className="flex" style={{ gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                      <Check style={{ width: 15, color: 'var(--green)', flex: 'none', marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                        {t.description && <div className="row-sub" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {!projectId && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Open this from a project to create these tasks directly.</div>}
            </section>
          )}

          {projectId && (
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => setAnalysis(null)}><ArrowRight style={{ width: 14 }} /> Analyze another issue</Button>
              <span className="dim" style={{ fontSize: 12, marginLeft: 10 }}><Bug style={{ width: 12, display: 'inline' }} /> Suggested analysis — always review before creating tasks.</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
