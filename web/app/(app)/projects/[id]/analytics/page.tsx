'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CheckCircle2, GitBranch, ListTodo, Timer, TrendingUp, Trophy } from 'lucide-react';
import { swrFetcher } from '@/lib/api';
import { useProject } from '@/features/project/project-shell';
import { Avatar, EmptyState, ErrorState, Progress, Spinner } from '@/components/ui';
import { DueChip, TaskStatusBadge } from '@/components/entities';
import { fmtDate } from '@/lib/format';

type Analytics = {
  totals: { totalTasks: number; doneTasks: number; openTasks: number; openIssues: number; totalIssues: number; blocked: number; inProgress: number; completionRate: number; avgCompletionDays: number | null };
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byAssignee: Array<{ assignee: string; open: number; done: number; estOpen: number; total: number }>;
  completedPerWeek: Array<{ week: string; tasks: number; hours: number }>;
  issuesPerWeek: Array<{ week: string; opened: number; resolved: number }>;
  dueSoon: Array<{ id: string; key: string; title: string; dueDate: string; status: string; priority: string; overdue: boolean; assignee: { id: string; name: string } | null }>;
  sprints: Array<{ id: string; name: string; status: string; progress: number; total: number; done: number; estHours: number; endDate?: string | null }>;
};

const STATUS_COLORS: Record<string, string> = { TODO: '#64748b', IN_PROGRESS: '#38bdf8', IN_REVIEW: '#a78bfa', BLOCKED: '#f87171', DONE: '#34d399' };
const PRIO_COLORS: Record<string, string> = { LOW: '#64748b', MEDIUM: '#eab308', HIGH: '#f97316', URGENT: '#ef4444' };

export default function ProjectAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const { project } = useProject(pid);
  const { data, error, isLoading, mutate } = useSWR<Analytics>(pid ? `/projects/${pid}/analytics` : null, swrFetcher, { refreshInterval: 30000 });

  const memberName = useMemo(() => {
    const m = new Map((project?.members ?? []).map((x) => [x.id, x.name]));
    return (id: string) => m.get(id) ?? 'Unknown';
  }, [project]);

  if (isLoading || !data) return <Spinner label="Crunching the numbers…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const workload = (data.byAssignee ?? []).map((a) => ({ name: memberName(a.assignee), open: a.open, done: a.done, est: a.estOpen }));
  const t = data.totals;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Metrics computed live from your tasks, issues and sprints — nothing fake.</p>
        </div>
      </div>

      <div className="stat-grid">
        <Stat icon={<ListTodo />} label="Total tasks" value={t.totalTasks} />
        <Stat icon={<CheckCircle2 />} label="Completed" value={t.doneTasks} />
        <Stat icon={<GitBranch />} label="Open issues" value={t.openIssues} />
        <Stat icon={<TrendingUp />} label="Completion" value={`${t.completionRate}%`} />
        <Stat icon={<Timer />} label="Avg time to done" value={t.avgCompletionDays != null ? `${t.avgCompletionDays}d` : '—'} />
      </div>

      <div className="stack mt">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
          <ChartCard title="Completed per week">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.completedPerWeek}>
                <defs>
                  <linearGradient id="fillTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tickFormatter={(w: string) => w.slice(5)} stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="tasks" name="tasks done" stroke="var(--accent)" strokeWidth={2} fill="url(#fillTasks)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Issues opened vs resolved">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.issuesPerWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tickFormatter={(w: string) => w.slice(5)} stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Legend />
                <Line type="monotone" dataKey="opened" stroke="var(--red)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" stroke="var(--green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tasks by status">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="status" stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="count" name="tasks" radius={[5, 5, 0, 0]}>
                  {data.byStatus.map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? 'var(--accent)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Priority mix">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.byPriority.filter((p) => p.count > 0)} dataKey="count" nameKey="priority" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {data.byPriority.filter((p) => p.count > 0).map((p) => <Cell key={p.priority} fill={PRIO_COLORS[p.priority] ?? 'var(--text-3)'} />)}
                </Pie>
                <Tooltip content={<Tip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {workload.length > 0 && (
          <ChartCard title="Workload by member (open / done)">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={workload}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Legend />
                <Bar dataKey="open" name="open" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                <Bar dataKey="done" name="done" stackId="a" fill="#34d399" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' }}>
          <section className="card">
            <div className="card-head"><h3>Due soon</h3></div>
            <div className="card-body">
              {data.dueSoon.length === 0 ? <EmptyState icon={<Timer />} title="Nothing due soon" /> : (
                <div className="row-list">
                  {data.dueSoon.map((task) => (
                    <Link key={task.id} href={`/projects/${pid}/tasks/${task.id}`} className="row-link">
                      <TaskStatusBadge status={task.status as any} compact />
                      <span className="mono dim" style={{ fontSize: 11.5, width: 62 }}>{task.key}</span>
                      <div className="row-main"><div className="row-title">{task.title}</div></div>
                      <DueChip due={task.dueDate} />
                      <Avatar user={task.assignee} size="sm" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h3><Trophy style={{ width: 14, display: 'inline' }} /> Sprints</h3></div>
            <div className="card-body stack">
              {data.sprints.length === 0 && <div className="dim" style={{ fontSize: 13 }}>No sprints yet — they show up here once you plan one.</div>}
              {data.sprints.map((s) => (
                <div key={s.id}>
                  <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <span className="chip">{s.status.toLowerCase()} · {s.done}/{s.total} · {s.estHours}h</span>
                  </div>
                  <Progress value={s.progress} green={s.status === 'COMPLETED' || s.progress === 100} />
                  {s.endDate && <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>ends {fmtDate(s.endDate)}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="stat-card">
      <span className="sc-icon">{icon}</span>
      <div className="sc-label">{label}</div>
      <div className="sc-value">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad chart-card">
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>{title}</h3>
      {children}
    </section>
  );
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-chip">
      {label != null && <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? 'var(--text-2)' }}>{p.name}: <strong>{p.value}</strong></div>
      ))}
    </div>
  );
}
