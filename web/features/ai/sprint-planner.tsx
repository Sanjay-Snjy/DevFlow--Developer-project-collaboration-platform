'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, Target } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import useSWR from 'swr';
import { Button, Field, Input, Modal, errMsg, useToast } from '@/components/ui';
import { TaskStatusBadge } from '@/components/entities';
import type { Task } from '@/lib/types';

type Planned = {
  sprintName: string;
  summary: string;
  suggestedTasks: Array<{ key: string; title: string; reason?: string | null; suggestedAssignee?: string | null; estimatedHours?: number; order: number }>;
  excluded: Array<{ key: string; reason: string }>;
  risks: string[];
  workloadDistribution: Array<Record<string, unknown>>;
};

type BacklogResp = { items: Task[] };

export default function SprintPlannerModal({ open, onClose, projectId, onApplied }: { open: boolean; onClose: () => void; projectId?: string; onApplied: () => void }) {
  const toast = useToast();
  const [days, setDays] = useState('14');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<Planned | null>(null);
  const [chosen, setChosen] = useState<boolean[]>([]);
  const [sprintName, setSprintName] = useState('');

  // The same backlog the backend feeds the AI: needed to map keys → task ids when applying.
  const { data: backlog } = useSWR<BacklogResp>(open && projectId ? `/projects/${projectId}/tasks?parent=none&limit=200&sort=order` : null, swrFetcher);

  const keyToTask = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of backlog?.items ?? []) if (t.status !== 'DONE') m.set(t.key, t);
    return m;
  }, [backlog]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPlan(null);
    setChosen([]);
    setSprintName('');
  }, [open]);

  if (!open) return null;

  const planSprint = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<Planned>('/ai/sprint-plan', { projectId, sprintDays: Number(days) || 14 });
      setPlan(res);
      setSprintName(res.sprintName || `Sprint ${new Date().toLocaleDateString(undefined, { month: 'short' })}`);
      setChosen(res.suggestedTasks.map(() => true));
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!projectId || !plan) return;
    const picked = plan.suggestedTasks.filter((_, i) => chosen[i] && keyToTask.has(_.key));
    if (!picked.length) return;
    setApplying(true);
    try {
      const today = new Date();
      const end = new Date(today.getTime() + (Number(days) || 14) * 86400000);
      const sprint = await api.post<{ id: string }>(`/projects/${projectId}/sprints`, {
        name: sprintName.trim() || 'Planned sprint',
        goal: plan.summary.slice(0, 500),
        status: 'ACTIVE',
        startDate: today.toISOString(),
        endDate: end.toISOString(),
      });
      await api.post(`/sprints/${sprint.id}/tasks`, { taskIds: picked.map((p) => keyToTask.get(p.key)!.id) });
      toast.push('success', `Sprint "${sprintName || 'Planned sprint'}" started with ${picked.length} tasks`);
      onApplied();
      onClose();
    } catch (e: any) {
      toast.push('error', 'Could not apply plan', e?.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI sprint planning" wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {plan && (
            <Button variant="primary" disabled={applying || !chosen.some(Boolean) || !chosen.some((c, i) => c && keyToTask.has(plan.suggestedTasks[i].key))} onClick={apply}>
              {applying ? <Loader2 className="spin" style={{ width: 14 }} /> : <Check style={{ width: 14 }} />} Start sprint with {plan.suggestedTasks.filter((t, i) => chosen[i] && keyToTask.has(t.key)).length} tasks
            </Button>
          )}
          {!plan && (
            <Button variant="primary" disabled={loading} onClick={planSprint}>
              {loading ? <Loader2 className="spin" style={{ width: 14 }} /> : <Sparkles style={{ width: 14 }} />} Generate plan
            </Button>
          )}
        </>
      }
    >
      {!plan ? (
        <div>
          <p className="muted mb" style={{ fontSize: 13 }}>
            The AI reviews your backlog, priorities, due dates and team workload, then proposes the next sprint. Review before it creates anything.
          </p>
          <Field label="Sprint length (days)" hint="Used to estimate team capacity.">
            <Input type="number" min={3} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          {error && <div className="error-text" role="alert">{error}</div>}
        </div>
      ) : (
        <div className="stack">
          <div className="flex" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div className="grow" style={{ minWidth: 220 }}>
              <Field label="Sprint name">
                <Input value={sprintName} onChange={(e) => setSprintName(e.target.value)} />
              </Field>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
              <span className="badge badge-soft">{plan.suggestedTasks.length} suggested · {plan.excluded.length} excluded</span>
            </div>
          </div>
          {plan.summary && <p className="muted" style={{ fontSize: 13 }}>{plan.summary}</p>}

          <section>
            <div className="section-title">Suggested tasks (in order)</div>
            <div className="card">
              <div className="row-list">
                {plan.suggestedTasks.map((t, i) => {
                  const task = keyToTask.get(t.key);
                  return (
                    <label key={t.key} className="flex" style={{ gap: 12, padding: '9px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={chosen[i] ?? false} onChange={(e) => setChosen((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} aria-label={`Include ${t.key}`} style={{ marginTop: 4 }} />
                      <span className="mono dim" style={{ fontSize: 11, marginTop: 3, width: 30 }}>{t.order + 1}.</span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="flex gap-sm">
                          <span className="mono dim" style={{ fontSize: 11.5 }}>{t.key}</span>
                          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</span>
                          {task && <TaskStatusBadge status={task.status} compact />}
                        </div>
                        {t.reason && <div className="row-sub">{t.reason}</div>}
                      </div>
                      <span className="dim" style={{ fontSize: 11.5, flex: 'none' }}>{t.suggestedAssignee ?? 'any'}{t.estimatedHours ? ` · ${t.estimatedHours}h` : ''}</span>
                    </label>
                  );
                })}
                {plan.suggestedTasks.length === 0 && <div className="dim center" style={{ padding: 18 }}>Nothing left to plan — the backlog may be empty.</div>}
              </div>
            </div>
          </section>

          {plan.excluded.length > 0 && (
            <section>
              <div className="section-title">Excluded this sprint</div>
              <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>
                {plan.excluded.map((e) => (
                  <span className="chip" key={e.key} title={e.reason}>{e.key} — {e.reason}</span>
                ))}
              </div>
            </section>
          )}

          {plan.risks.length > 0 && (
            <section>
              <div className="section-title">Risks to watch</div>
              <div className="stack" style={{ gap: 6 }}>
                {plan.risks.map((r, i) => (
                  <div key={i} className="flex" style={{ gap: 8 }}><AlertTriangle style={{ width: 14, color: 'var(--amber)', flex: 'none' }} /><span style={{ fontSize: 13 }}>{r}</span></div>
                ))}
              </div>
            </section>
          )}

          {plan.workloadDistribution.length > 0 && (
            <section>
              <div className="section-title"><Target style={{ width: 12, display: 'inline' }} /> Workload balance</div>
              <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>
                {plan.workloadDistribution.map((w, i) => (
                  <span className="chip" key={i}>{String(w.name ?? w.username ?? w.userId ?? `member ${i + 1}`)}: ~{String(w.hours ?? '?')}h</span>
                ))}
              </div>
            </section>
          )}

          <div className="dim" style={{ fontSize: 12 }}>Applying starts a new active sprint (any currently active sprint is auto-completed) and assigns the ticked tasks.</div>
        </div>
      )}
    </Modal>
  );
}
