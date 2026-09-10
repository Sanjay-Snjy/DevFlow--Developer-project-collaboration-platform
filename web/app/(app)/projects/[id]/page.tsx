'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarClock, CheckCircle2, GitBranch, ListTodo } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { useProject } from '@/features/project/project-shell';
import type { ProjectDetail } from '@/lib/types';
import { AvatarStack, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { ActivityFeed, DueChip } from '@/components/entities';
import { fmtDate } from '@/lib/format';

type Analytics = {
  totals: { totalTasks: number; doneTasks: number; openIssues: number; blocked: number; completionRate: number };
  dueSoon: Array<{ id: string; key: string; title: string; dueDate: string; status: string; overdue: boolean }>;
};

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const { project } = useProject(params.id);
  const { data: analytics } = useSWR<Analytics>(params.id ? `/projects/${params.id}/analytics` : null, swrFetcher, { refreshInterval: 30000 });
  const { data: activity } = useSWR<{ items: any[] }>(params.id ? `/projects/${params.id}/activity?limit=8` : null, swrFetcher);

  if (!project) return <Spinner label="Loading project…" />;

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat icon={<ListTodo />} label="Total tasks" value={project.counts.totalTasks} />
        <Stat icon={<CheckCircle2 />} label="Completed" value={project.counts.doneTasks} />
        <Stat icon={<GitBranch />} label="Open issues" value={project.counts.openIssues} />
        <Stat icon={<ListTodo />} label="Completion" value={`${project.counts.totalTasks ? Math.round((project.counts.doneTasks / project.counts.totalTasks) * 100) : 0}%`} />
        <Stat icon={<CalendarClock />} label="Due" value={project.dueDate ? fmtDate(project.dueDate) : '—'} />
      </div>

      <div className="card card-pad">
        <div className="flex" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ marginBottom: 8 }}>Team ({project.members.length})</h3>
            <AvatarStack users={project.members} max={8} />
          </div>
          {project.activeSprint && (
            <div style={{ textAlign: 'right' }}>
              <div className="section-title" style={{ marginBottom: 4 }}>Active sprint</div>
              <Link href={`/projects/${project.id}/sprints`} className="badge badge-accent">{project.activeSprint.name}</Link>
            </div>
          )}
          {project.repositories && project.repositories.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div className="section-title" style={{ marginBottom: 4 }}>Repositories</div>
              {project.repositories.map((r) => (
                <Link key={r.fullName} href={`/projects/${project.id}/github`} className="badge badge-soft" style={{ marginRight: 4 }}>{r.fullName}</Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="ov-grid">
        <section className="card">
          <div className="card-head"><h3>Upcoming deadlines</h3></div>
          <div className="card-body">
            {!analytics ? <div className="skeleton" style={{ height: 80 }} /> : analytics.dueSoon.length === 0 ? (
              <EmptyState icon={<CalendarClock />} title="Nothing due soon" />
            ) : (
              analytics.dueSoon.map((t) => (
                <div key={t.id} className="flex" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="mono dim" style={{ width: 60, fontSize: 11.5 }}>{t.key}</span>
                  <Link href={`/projects/${project.id}/tasks/${t.id}`} className="grow muted">{t.title}</Link>
                  <DueChip due={t.dueDate} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Recent activity</h3>
            <Link href={`/projects/${project.id}/activity`} className="btn btn-ghost btn-sm">All</Link>
          </div>
          <div className="card-body">
            {!activity ? <div className="skeleton" style={{ height: 120 }} /> : <ActivityFeed items={activity.items ?? []} dense />}
          </div>
        </section>
      </div>
      <style jsx>{`@media (max-width: 960px){ .ov-grid{ grid-template-columns: 1fr !important; } }`}</style>
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
