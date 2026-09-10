'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckCircle2, FolderKanban, Github, ListTodo } from 'lucide-react';
import { swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import { ROLE_LABEL } from '@/lib/constants';
import type { ProfileTask, UserProfile } from '@/lib/types';
import { Avatar, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { ActivityFeed, DueChip, TaskStatusBadge } from '@/components/entities';
import { timeAgo } from '@/lib/format';

export default function MemberProfilePage() {
  const params = useParams<{ userId: string }>();
  const { workspace } = useWorkspace();
  const { data, error, isLoading } = useSWR<UserProfile>(
    workspace ? `/workspaces/${workspace.id}/members/${params.userId}/profile` : null,
    swrFetcher,
    { refreshInterval: 20000 }
  );

  if (!workspace) return <EmptyState title="No workspace selected" />;
  if (isLoading || !data) return <Spinner label="Loading profile…" />;
  if (error) return <ErrorState message={error.message} />;
  const p = data.profile;

  return (
    <div>
      <div className="page-head">
        <div className="flex" style={{ gap: 18, alignItems: 'center' }}>
          <Avatar user={p} size="lg" />
          <div>
            <h1 className="page-title">{p.name}</h1>
            <p className="page-sub">@{p.username} · {p.email}</p>
            <div className="flex gap-sm mt">
              <span className="badge badge-soft">{ROLE_LABEL[data.role]}</span>
              {p.githubUsername && <span className="chip"><Github style={{ width: 11 }} /> @{p.githubUsername}</span>}
              {p.joinedAt && <span className="dim" style={{ fontSize: 12 }}>joined {timeAgo(p.joinedAt)}</span>}
            </div>
          </div>
        </div>
      </div>

      {p.bio && <p className="muted" style={{ maxWidth: 640, marginBottom: 18 }}>{p.bio}</p>}
      {p.skills && p.skills.length > 0 && (
        <div className="flex mb" style={{ flexWrap: 'wrap', gap: 5 }}>
          {p.skills.map((s) => <span className="chip" key={s}>{s}</span>)}
        </div>
      )}

      <div className="stat-grid mb">
        <Stat icon={<ListTodo />} label="Open tasks" value={data.stats.assigned} />
        <Stat icon={<CheckCircle2 />} label="Completed" value={data.stats.completedTasks} />
        <Stat icon={<FolderKanban />} label="Projects" value={data.stats.projects} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, alignItems: 'start' }} className="pr-grid">
        <section className="card">
          <div className="card-head"><h3>Projects</h3></div>
          <div className="row-list">
            {data.projects.length === 0 && <div className="dim center" style={{ padding: 20 }}>No shared projects.</div>}
            {data.projects.map((proj) => (
              <Link key={proj.id} href={`/projects/${proj.id}`} className="row-link">
                <span className="mono badge badge-soft">{proj.key}</span>
                <div className="row-main"><div className="row-title">{proj.name}</div></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>Assigned tasks</h3></div>
          <div className="row-list">
            {data.tasks.length === 0 && <div className="dim center" style={{ padding: 20 }}>Nothing assigned right now.</div>}
            {data.tasks.map((t: ProfileTask) => (
              <Link key={t.key} href={t.project ? `/projects/${t.project.id}/tasks/${t.id}` : '#'} className="row-link">
                <TaskStatusBadge status={t.status} compact />
                <span className="mono dim" style={{ fontSize: 11.5, width: 62 }}>{t.key}</span>
                <div className="row-main">
                  <div className="row-title">{t.title}</div>
                  {t.project && <div className="row-sub">{t.project.key}</div>}
                </div>
                {t.dueDate && <DueChip due={t.dueDate} />}
              </Link>
            ))}
          </div>
        </section>
      </div>

      {data.recentActivity.length > 0 && (
        <section className="card card-pad mt">
          <h3 style={{ marginBottom: 10 }}>Recent activity</h3>
          <ActivityFeed items={data.recentActivity} dense />
        </section>
      )}
      <style jsx>{`@media (max-width:760px){ .pr-grid{ grid-template-columns: 1fr !important; } }`}</style>
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
