'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { qs, swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import type { ActivityItem } from '@/lib/types';
import { Button, EmptyState, ErrorState, Select, Spinner } from '@/components/ui';
import { ActivityFeed } from '@/components/entities';

type Resp = { items: ActivityItem[]; total: number; page: number; limit: number };

export default function WorkspaceActivityPage() {
  const { workspace } = useWorkspace();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const query = useMemo(() => qs({ page, limit: 40, type }), [page, type]);
  const { data, error, isLoading, mutate } = useSWR<Resp>(workspace ? `/workspaces/${workspace.id}/activity${query}` : null, swrFetcher, { refreshInterval: 20000 });

  if (!workspace) return <EmptyState title="No workspace selected" />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-sub">A timeline of everything happening across {workspace.name}.</p>
        </div>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter activity type">
          <option value="">All activity</option>
          <option value="task.moved">Task moves</option>
          <option value="task.created">Tasks created</option>
          <option value="issue.created">Issues reported</option>
          <option value="comment.added">Comments</option>
          <option value="project.created">Projects</option>
          <option value="member.joined">Members</option>
          <option value="sprint.created">Sprints</option>
        </Select>
      </div>

      {isLoading && !data && <Spinner label="Loading activity…" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!isLoading && !error && data && data.items.length === 0 && (
        <EmptyState icon={<Activity />} title="No activity yet" sub="Changes across the workspace will stream in here." />
      )}
      {data && data.items.length > 0 && (
        <div className="card card-pad">
          <ActivityFeed items={data.items} />
          <div className="flex" style={{ justifyContent: 'space-between', paddingTop: 14 }}>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft style={{ width: 14 }} /> Previous</Button>
            <span className="dim" style={{ fontSize: 12.5 }}>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} events</span>
            <Button variant="ghost" size="sm" disabled={data.items.length < data.limit} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight style={{ width: 14 }} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
