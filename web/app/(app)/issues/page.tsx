'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Bug, Search } from 'lucide-react';
import { api, qs, swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES } from '@/lib/constants';
import type { Issue } from '@/lib/types';
import { Avatar, Button, EmptyState, ErrorState, Input, Select, Spinner, useToast } from '@/components/ui';
import { IssueStatusBadge, IssueTypeBadge, PriorityBadge } from '@/components/entities';
import { timeAgo } from '@/lib/format';

type Resp = { items: Array<Issue & { project: { id: string; key: string; name: string } }>; total: number };

export default function WorkspaceIssuesPage() {
  const { workspace, loading } = useWorkspace();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const query = useMemo(() => qs({ limit: 100, q, status, type, priority }), [q, status, type, priority]);
  const { data, error, isLoading, mutate } = useSWR<Resp>(workspace ? `/workspaces/${workspace.id}/issues${query}` : null, swrFetcher, { refreshInterval: 15000 });

  const quickStatus = async (i: Issue, next: string) => {
    try {
      await api.patch(`/issues/${i.id}`, { status: next });
      toast.push('success', `${i.key} → ${next.replace('_', ' ')}`);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  if (loading) return <Spinner label="Loading…" />;
  if (!workspace) return <EmptyState title="No workspace selected" />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Issues</h1>
          <p className="page-sub">Every open issue across {workspace.name}.</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="flex" style={{ flex: 1, minWidth: 180 }}>
          <Search style={{ width: 15, color: 'var(--text-3)', marginLeft: 10 }} />
          <Input placeholder="Search issues…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 4 }} aria-label="Search issues" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <label className="check-row btn-ghost" style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> include closed
        </label>
      </div>

      {isLoading && !data && <Spinner label="Loading issues…" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!isLoading && !error && data && data.items.length === 0 && (
        <EmptyState icon={<Bug />} title="No issues found" sub={q ? 'Nothing matches your search.' : 'Issues your team reports across projects will appear here.'} />
      )}

      {data && data.items.length > 0 && (() => {
        const items = data.items.filter((i) => showClosed || status || i.status !== 'CLOSED');
        if (!items.length) {
          return <EmptyState icon={<Bug />} title="No open issues" sub="Closed issues are hidden — tick “include closed” to see them." />;
        }
        return (
        <div className="card">
          <div className="row-list">
            {items.map((i) => (
              <div key={i.id} className="flex" style={{ gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                <IssueTypeBadge type={i.type} />
                <Link href={`/projects/${i.project.id}/issues/${i.id}`} className="grow" style={{ minWidth: 0 }}>
                  <div className="flex gap-sm">
                    <span className="mono dim" style={{ fontSize: 11.5, flex: 'none' }}>{i.key}</span>
                    <span className="row-title">{i.title}</span>
                  </div>
                  <div className="row-sub">{i.project.key} · {i.project.name}</div>
                </Link>
                <IssueStatusBadge status={i.status} />
                <PriorityBadge priority={i.priority} />
                <span className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{timeAgo(i.createdAt)}</span>
                <Avatar user={i.assignee} size="sm" />
                <select className="select btn-sm" style={{ width: 'auto', minWidth: 105 }} value={i.status} onChange={(e) => quickStatus(i, e.target.value)} aria-label={`Change ${i.key} status`}>
                  {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
