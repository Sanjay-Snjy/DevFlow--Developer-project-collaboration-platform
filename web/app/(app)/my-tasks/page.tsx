'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ListTodo, Search } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import type { DashboardData, DashTask } from '@/lib/types';
import { Button, EmptyState, ErrorState, Input, Spinner, useToast } from '@/components/ui';
import { DueChip, TaskStatusBadge } from '@/components/entities';
import { cx } from '@/lib/format';
import { TASK_STATUSES, type TaskStatus } from '@/lib/constants';

export default function MyTasksPage() {
  const { workspace } = useWorkspace();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('ALL');
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(workspace ? `/workspaces/${workspace.id}/dashboard?all=1` : null, swrFetcher, { refreshInterval: 20000 });
  const toast = useToast();

  if (!workspace) return <div />;
  if (isLoading || !data) return <Spinner label="Loading your tasks…" />;
  if (error) return <ErrorState message={error.message} />;

  const tasks = data.myTasks.filter((t) => {
    const okQ = !q || t.title.toLowerCase().includes(q.toLowerCase()) || t.key.toLowerCase().includes(q.toLowerCase());
    const okS = status === 'ALL' || t.status === status;
    return okQ && okS;
  });

  const setStatusQuick = async (t: DashTask, next: TaskStatus) => {
    try {
      await api.patch(`/tasks/${t.id}`, { status: next });
      toast.push('success', `${t.key} → ${next.replace('_', ' ')}`);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  const grouped = TASK_STATUSES.map((s) => ({ s, list: tasks.filter((t) => t.status === s) })).filter((g) => g.list.length);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">My tasks</h1>
          <p className="page-sub">{data.myTasks.length} open tasks assigned to you across {workspace.name}.</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="flex" style={{ flex: 1, minWidth: 180 }}>
          <Search style={{ width: 15, color: 'var(--text-3)', marginLeft: 10 }} />
          <Input placeholder="Filter your tasks…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 4 }} aria-label="Filter tasks" />
        </div>
        <div className="tabs" style={{ border: 0, gap: 6 }}>
          {['ALL', ...TASK_STATUSES].map((s) => (
            <button key={s} className={cx('btn btn-sm', status === s ? 'btn-soft' : 'btn-ghost')} onClick={() => setStatus(s)}>
              {s === 'ALL' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={<ListTodo />} title="No tasks match" sub="When someone assigns you a task it will show up here." />
      ) : (
        <div className="stack">
          {grouped.map((g) => (
            <section className="card" key={g.s}>
              <div className="card-head">
                <h3 className="flex" style={{ fontSize: 14 }}><TaskStatusBadge status={g.s} /> {g.s.replace('_', ' ')}</h3>
                <span className="dim">{g.list.length}</span>
              </div>
              <div>
                {g.list.map((t) => (
                  <div key={t.id} className="flex" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                    <span className="mono dim" style={{ fontSize: 11.5, width: 64 }}>{t.key}</span>
                    <Link href={`/projects/${t.project?.id}/tasks/${t.id}`} className="grow" style={{ overflow: 'hidden' }}>
                      <span className="row-title" style={{ whiteSpace: 'nowrap' }}>{t.title}</span>
                    </Link>
                    {t.project && <span className="chip">{t.project.key}</span>}
                    <DueChip due={t.dueDate} />
                    <span className="chip">{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</span>
                    <select
                      className="select btn-sm"
                      style={{ width: 'auto', minWidth: 110, padding: '4px 22px 4px 8px', fontSize: 12 }}
                      value={t.status}
                      onChange={(e) => setStatusQuick(t, e.target.value as TaskStatus)}
                      aria-label={`Change status of ${t.key}`}
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
