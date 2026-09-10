'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, FolderKanban, Inbox, Layers, ListTodo, Users } from 'lucide-react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { greeting, timeAgo } from '@/lib/format';
import { useAuth, useWorkspace } from '@/lib/hooks';
import type { DashboardData } from '@/lib/types';
import { Avatar, EmptyState, ErrorState, Progress, Spinner } from '@/components/ui';
import { ActivityFeed, DueChip, TaskStatusBadge } from '@/components/entities';

export default function DashboardPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { data, error, isLoading } = useSWR<DashboardData>(workspace ? `/workspaces/${workspace.id}/dashboard` : null, swrFetcher, { refreshInterval: 30000 });

  if (!workspace) return <div />;
  if (isLoading || !data) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorState message={error.message} />;

  const d = data;
  const stats = [
    { label: 'Projects', value: d.stats.projects, icon: <FolderKanban /> },
    { label: 'Tasks', value: d.stats.tasks, icon: <Layers /> },
    { label: 'Completed', value: d.stats.completedTasks, icon: <CheckCircle2 /> },
    { label: 'Open issues', value: d.stats.openIssues, icon: <Inbox /> },
    { label: 'Team', value: d.stats.members, icon: <Users /> },
    { label: 'My open tasks', value: d.stats.myOpenTasks, icon: <ListTodo /> },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{greeting()}, {user?.name?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="page-sub">
            Here’s what’s happening in <strong>{workspace.name}</strong>.
            {workspace.demo && <span className="demo-note" style={{ marginLeft: 8 }}>demo data</span>}
          </p>
        </div>
      </div>

      <div className="stat-grid mb">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="sc-icon">{s.icon}</span>
            <div className="sc-label">{s.label}</div>
            <div className="sc-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="dash-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>My tasks</h3>
              <Link href="/my-tasks" className="btn btn-ghost btn-sm">View all <ArrowRight style={{ width: 13 }} /></Link>
            </div>
            <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
              {d.myTasks.length === 0 ? (
                <EmptyState icon={<ListTodo />} title="Nothing assigned to you" sub="Tasks assigned to you will appear here." />
              ) : (
                d.myTasks.slice(0, 6).map((t) => (
                  <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <TaskStatusBadge status={t.status} compact />
                    <Link href={`/projects/${t.project?.id}/tasks/${t.id}`} className="grow" style={{ overflow: 'hidden' }}>
                      <span className="row-title">{t.key}</span> <span className="muted">{t.title}</span>
                    </Link>
                    <DueChip due={t.dueDate} />
                    <Avatar user={t.assignee} size="sm" />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Upcoming deadlines</h3>
            </div>
            <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
              {d.deadlines.length === 0 ? (
                <EmptyState icon={<CalendarClock />} title="No upcoming deadlines" sub="Tasks due in the next two weeks will be listed here." />
              ) : (
                d.deadlines.map((t) => (
                  <div key={t.id} className="flex" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="mono dim" style={{ fontSize: 11.5, width: 62 }}>{t.key}</span>
                    <Link href={`/projects/${t.project?.id}/tasks/${t.id}`} className="grow">
                      <span className="muted">{t.title}</span>
                    </Link>
                    <DueChip due={t.dueDate} />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Recent activity</h3>
              <Link href="/activity" className="btn btn-ghost btn-sm">Timeline <ArrowRight style={{ width: 13 }} /></Link>
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              <ActivityFeed items={d.activity.slice(0, 8)} dense />
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>Project progress</h3>
              <Link href="/projects" className="btn btn-ghost btn-sm">All projects</Link>
            </div>
            <div className="card-body stack" style={{ gap: 14 }}>
              {d.projects.length === 0 && <EmptyState icon={<FolderKanban />} title="No projects yet" sub="Create your first project to start planning." />}
              {d.projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="stack" style={{ gap: 6, display: 'flex', flexDirection: 'column' }}>
                  <div className="flex" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <span className="mono dim" style={{ fontSize: 11.5, marginRight: 8 }}>{p.key}</span>
                      <strong>{p.name}</strong>
                    </div>
                    <span className="dim" style={{ fontSize: 12 }}>{p.doneTasks}/{p.totalTasks} done</span>
                  </div>
                  <Progress value={p.progress} />
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h3>Completion rate</h3></div>
            <div className="card-body">
              <div style={{ fontSize: 40, fontWeight: 800 }}>{d.stats.completionRate}%</div>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
                {d.stats.completedTasks} of {d.stats.tasks} tasks completed across {d.stats.projects} projects
              </div>
              <div className="mt"><Progress value={d.stats.completionRate} green /></div>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h3>Workspace pulse</h3></div>
            <div className="card-body">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <li className="flex"><span className="dot" style={{ background: 'var(--sky)' }} /> {d.stats.openTasks} open tasks remaining</li>
                <li className="flex"><span className="dot" style={{ background: 'var(--red)' }} /> {d.stats.openIssues} open issues to triage</li>
                <li className="flex"><span className="dot" style={{ background: 'var(--green)' }} /> {d.stats.completedTasks} tasks completed</li>
                <li className="flex"><span className="dot" style={{ background: 'var(--violet)' }} /> last activity {timeAgo(d.activity[0]?.createdAt)}</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 1000px) { .dash-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
