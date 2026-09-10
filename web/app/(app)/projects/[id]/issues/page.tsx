'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { Bug, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { api, qs, swrFetcher } from '@/lib/api';
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES, roleAtLeast } from '@/lib/constants';
import type { Issue } from '@/lib/types';
import IssueFormModal from '@/features/issues/issue-form';
import IssueAnalyzerModal from '@/features/ai/issue-analyzer';
import { useProject } from '@/features/project/project-shell';
import { useProjectOptions } from '@/features/tasks/task-form';
import { Button, Confirm, EmptyState, ErrorState, Input, Menu, MenuItem, Select, Spinner, useToast } from '@/components/ui';
import { IssueStatusBadge, IssueTypeBadge, PriorityBadge } from '@/components/entities';
import { Avatar } from '@/components/ui';
import { timeAgo } from '@/lib/format';

type Resp = { items: Issue[]; total: number; page: number; limit: number };

export default function ProjectIssuesPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const { project } = useProject(pid);
  const { members } = useProjectOptions(pid);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [deleting, setDeleting] = useState<Issue | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const toast = useToast();

  const query = useMemo(
    () => qs({ page, limit: 40, q, status, type, priority, assignee }),
    [page, q, status, type, priority, assignee]
  );
  const { data, error, isLoading, mutate } = useSWR<Resp>(pid ? `/projects/${pid}/issues${query}` : null, swrFetcher, { refreshInterval: 15000 });
  const canManage = project ? roleAtLeast(project.myRole, 'MANAGER') : false;

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.del(`/issues/${deleting.id}`);
      toast.push('success', `${deleting.key} deleted`);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Delete failed', e?.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Issues</h1>
          <p className="page-sub">{data?.total ?? '—'} issues in {project?.key ?? ''}</p>
        </div>
        <div className="page-actions">
          <Button variant="soft" onClick={() => setAiOpen(true)}><Sparkles style={{ width: 14 }} /> AI analyze</Button>
          <Button variant="primary" onClick={() => { setEditing(null); setCreateOpen(true); }}><Plus /> Report issue</Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="flex" style={{ flex: 1, minWidth: 200 }}>
          <Search style={{ width: 15, color: 'var(--text-3)', marginLeft: 10 }} />
          <Input placeholder="Search issues…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 4 }} aria-label="Search issues" />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>
          {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type">
          <option value="">All types</option>
          {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }} aria-label="Assignee">
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>

      {isLoading && <Spinner label="Loading issues…" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {!isLoading && !error && data && data.items.length === 0 && (
        <EmptyState
          icon={<Bug />}
          title={q || status || type ? 'No issues match your filters' : 'No issues yet'}
          sub={q || status || type ? 'Try removing some filters.' : 'Report a bug or feature request.'}
          action={!q && !status ? <Button variant="primary" onClick={() => { setEditing(null); setCreateOpen(true); }}><Plus /> Report issue</Button> : undefined}
        />
      )}

      {!isLoading && !error && data && data.items.length > 0 && (
        <div className="card">
          <div className="row-list">
            {data.items.map((i) => (
              <div key={i.id} className="flex" style={{ gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                <IssueTypeBadge type={i.type} />
                <Link href={`/projects/${pid}/issues/${i.id}`} className="grow flex" style={{ minWidth: 0, gap: 10 }}>
                  <span className="mono dim" style={{ fontSize: 11.5, flex: 'none' }}>{i.key}</span>
                  <span className="row-title">{i.title}</span>
                </Link>
                <IssueStatusBadge status={i.status} />
                <PriorityBadge priority={i.priority} />
                <span className="dim" style={{ fontSize: 11.5 }}>{timeAgo(i.createdAt)}</span>
                <Avatar user={i.assignee} size="sm" />
                <Menu label={`Actions for ${i.key}`} button={<button className="icon-btn" style={{ width: 28, height: 28 }}><ChevronDown style={{ width: 15 }} /></button>}>
                  <MenuItem onClick={() => { setEditing(i); setCreateOpen(true); }}><Pencil /> Edit</MenuItem>
                  {canManage && <MenuItem className="danger" onClick={() => setDeleting(i)}><Trash2 /> Delete</MenuItem>}
                </Menu>
              </div>
            ))}
          </div>
          {(data?.total ?? 0) > data.items.length && (
            <div className="flex" style={{ justifyContent: 'space-between', padding: 12 }}>
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft style={{ width: 14 }} /> Previous</Button>
              <span className="dim" style={{ fontSize: 12.5 }}>Page {data.page} · {data.total} issues</span>
              <Button variant="ghost" size="sm" disabled={data.items.length < data.limit} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight style={{ width: 14 }} /></Button>
            </div>
          )}
        </div>
      )}

      <IssueAnalyzerModal projectId={pid} open={aiOpen} onClose={() => setAiOpen(false)} />
      <IssueFormModal projectId={pid} open={createOpen} issue={editing} onClose={() => { setCreateOpen(false); setEditing(null); }} onSaved={() => mutate()} />
      <Confirm open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={remove} title={`Delete ${deleting?.key}?`} message={`"${deleting?.title}" will be permanently deleted.`} danger />
    </div>
  );
}
