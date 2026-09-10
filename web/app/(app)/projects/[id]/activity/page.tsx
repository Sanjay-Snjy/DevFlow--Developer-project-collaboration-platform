'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { qs, swrFetcher } from '@/lib/api';
import type { ActivityItem } from '@/lib/types';
import { Button, EmptyState, ErrorState, Select, Spinner } from '@/components/ui';
import { ActivityFeed } from '@/components/entities';

type Resp = { items: ActivityItem[]; total: number; page: number; limit: number };

const TYPES = [
  ['', 'All activity'],
  ['task.moved', 'Task moves'],
  ['task.created', 'Task created'],
  ['task.updated', 'Task updated'],
  ['task.deleted', 'Task deleted'],
  ['issue.created', 'Issue reported'],
  ['issue.updated', 'Issue updated'],
  ['comment.added', 'Comments'],
  ['comment.deleted', 'Comment deleted'],
  ['sprint.created', 'Sprints'],
  ['sprint.updated', 'Sprint updates'],
  ['project.created', 'Project'],
  ['github.linked', 'GitHub'],
];

export default function ProjectActivityPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const query = useMemo(() => qs({ page, limit: 30, type }), [page, type]);
  const { data, error, isLoading, mutate } = useSWR<Resp>(pid ? `/projects/${pid}/activity${query}` : null, swrFetcher, { refreshInterval: 20000 });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-sub">{data?.total ?? '—'} events</p>
        </div>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>

      {isLoading && !data && <Spinner label="Loading activity…" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!isLoading && !error && data && data.items.length === 0 && (
        <EmptyState icon={<Activity />} title="No activity yet" sub="Actions on this project will show up here." />
      )}
      {data && data.items.length > 0 && (
        <div className="card card-pad">
          <ActivityFeed items={data.items} />
          <div className="flex" style={{ justifyContent: 'space-between', paddingTop: 12 }}>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft style={{ width: 14 }} /> Previous</Button>
            <span className="dim" style={{ fontSize: 12.5 }}>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} events</span>
            <Button variant="ghost" size="sm" disabled={data.items.length < data.limit} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight style={{ width: 14 }} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
