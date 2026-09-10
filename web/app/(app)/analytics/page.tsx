'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, CheckCircle2, FolderKanban, GitBranch, ListTodo, Users } from 'lucide-react';
import { swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import type { WorkspaceDetail } from '@/lib/types';
import { EmptyState, ErrorState, Progress, Spinner } from '@/components/ui';
import { PROJECT_STATUS_LABEL } from '@/lib/constants';

type WS = {
  totals: { projectCount: number; membersCount: number; totalTasks: number; doneTasks: number; openTasks: number; openIssues: number; totalIssues: number; completionRate: number };
  byStatus: Array<{ status: string; count: number }>;
  issueStatus: Array<{ status: string; count: number }>;
  projectProgress: Array<{ id: string; key: string; name: string; status: string; dueDate?: string | null; total: number; done: number; progress: number }>;
  completedWeekly: Array<{ week: string; tasks: number; hours: number }>;
  resolvedWeekly: Array<{ week: string; tasks: number }>;
  activityDaily: Array<{ day: string; count: number }>;
  memberLoad: Array<{ member: string; open: number; done: number; total: number }>;
};

const STATUS_COLORS: Record<string, string> = { TODO: '#64748b', IN_PROGRESS: '#38bdf8', IN_REVIEW: '#a78bfa', BLOCKED: '#f87171', DONE: '#34d399' };
const ISSUE_COLORS: Record<string, string> = { OPEN: '#f87171', IN_PROGRESS: '#38bdf8', RESOLVED: '#34d399', CLOSED: '#64748b' };

export default function WorkspaceAnalyticsPage() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<WS>(workspace ? `/workspaces/${workspace.id}/analytics` : null, swrFetcher, { refreshInterval: 30000 });
  const { data: ws } = useSWR<WorkspaceDetail>(workspace ? `/workspaces/${workspace.id}` : null, swrFetcher);

  if (!workspace) return <EmptyState title="No workspace selected" />;
  if (isLoading || !data) return <Spinner label="Crunching workspace metrics…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const nameOf = (id: string) => ws?.members.find((m) => m.id === id)?.name ?? 'Unknown';
  const workload = data.memberLoad.map((m) => ({ name: nameOf(m.member), open: m.open, done: m.done }));
  const t = data.totals;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Live metrics for {workspace.name}, aggregated from real project data.</p>
        </div>
      </div>

      <div className="stat-grid">
        <Stat icon={<FolderKanban />} label="Projects" value={t.projectCount} />
        <Stat icon={<Users />} label="Members" value={t.membersCount} />
        <Stat icon={<ListTodo />} label="Tasks" value={t.totalTasks} />
        <Stat icon={<CheckCircle2 />} label="Done" value={t.doneTasks} />
        <Stat icon={<GitBranch />} label="Open issues" value={t.openIssues} />
        <Stat icon={<BarChart3 />} label="Completion" value={`${t.completionRate}%`} />
      </div>

      <div className="stack mt">
        {data.projectProgress.length === 0 ? (
          <EmptyState title="No projects yet" sub="Create a project to see analytics." />
        ) : (
          <section className="card card-pad">
            <h3 style={{ marginBottom: 12 }}>Project progress</h3>
            <div className="stack">
              {data.projectProgress.map((p) => (
                <div key={p.id}>
                  <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                    <Link href={`/projects/${p.id}/analytics`} style={{ fontWeight: 600, fontSize: 13.5 }}>{p.key} · {p.name}</Link>
                    <span className="dim" style={{ fontSize: 12 }}>{p.done}/{p.total} tasks · {PROJECT_STATUS_LABEL[p.status as keyof typeof PROJECT_STATUS_LABEL] ?? p.status}</span>
                  </div>
                  <Progress value={p.progress} green={p.progress === 100} />
                </div>
              ))}
            </div>
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
          <ChartCard title="Completed per week (12 weeks)">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.completedWeekly}>
                <defs>
                  <linearGradient id="wsTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-2)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--accent-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tickFormatter={(w: string) => w.slice(5)} stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="tasks" name="tasks done" stroke="var(--accent-2)" strokeWidth={2} fill="url(#wsTasks)" />
              </AreaChart>
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

          <ChartCard title="Issues by status">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.issueStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="status" stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="count" name="issues" radius={[5, 5, 0, 0]}>
                  {data.issueStatus.map((s) => <Cell key={s.status} fill={ISSUE_COLORS[s.status] ?? 'var(--accent)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Team activity (events/day)">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.activityDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Line type="monotone" dataKey="count" name="events" stroke="var(--violet)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {workload.length > 0 && (
          <ChartCard title="Workload by member">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={workload}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-3)" />
                <YAxis allowDecimals={false} stroke="var(--text-3)" width={30} />
                <Tooltip content={<Tip />} />
                <Legend />
                <Bar dataKey="open" name="open" stackId="a" fill="#f97316" />
                <Bar dataKey="done" name="done" stackId="a" fill="#34d399" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
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
