'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { KanbanSquare } from 'lucide-react';
import { swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import type { ProjectSummary } from '@/lib/types';
import { EmptyState, ErrorState, Spinner } from '@/components/ui';
import BoardView from '@/features/board/board-view';

export default function BoardsPage() {
  const { workspace, loading } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<ProjectSummary[]>(workspace ? `/projects?workspace=${workspace.id}` : null, swrFetcher, { refreshInterval: 20000 });
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!selected && data?.length) setSelected(data[0].id);
  }, [data, selected]);

  const active = useMemo(() => (data ?? []).find((p) => p.id === selected), [data, selected]);

  if (loading || (isLoading && !data)) return <Spinner label="Loading boards…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!workspace) return <EmptyState title="No workspace selected" />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Boards</h1>
          <p className="page-sub">Kanban boards for every project in {workspace.name}.</p>
        </div>
      </div>

      {!data?.length ? (
        <EmptyState icon={<KanbanSquare />} title="No projects yet" sub="Create a project in this workspace to get a board." />
      ) : (
        <>
          <div className="tabs mb" role="tablist" aria-label="Projects">
            {(data ?? []).map((p) => (
              <button key={p.id} className={p.id === active?.id ? 'tab active' : 'tab'} role="tab" aria-selected={p.id === active?.id} onClick={() => setSelected(p.id)}>
                {p.key}
                <span className="dim" style={{ fontWeight: 400 }}> · {p.name}</span>
              </button>
            ))}
          </div>
          {active ? <BoardView projectId={active.id} /> : null}
        </>
      )}
    </div>
  );
}
