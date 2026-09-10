'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Flag, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES, roleAtLeast } from '@/lib/constants';
import type { IssueDetail } from '@/lib/types';
import { useProject } from '@/features/project/project-shell';
import { useProjectOptions, LabelInput } from '@/features/tasks/task-form';
import CommentSection from '@/features/comments/comment-section';
import IssueAnalyzerModal from '@/features/ai/issue-analyzer';
import { Avatar, Button, ErrorState, Input, Select, Spinner, Textarea, errMsg, useToast } from '@/components/ui';
import { IssueStatusBadge, IssueTypeBadge, PriorityBadge, TaskStatusBadge } from '@/components/entities';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/hooks';

export default function IssueDetailPage() {
  const params = useParams<{ id: string; issueId: string }>();
  const pid = params.id;
  const iid = params.issueId;
  const { project, mutate: mutateProject } = useProject(pid);
  const { members } = useProjectOptions(pid);
  const { user } = useAuth();
  const toast = useToast();
  const { data: issue, error, isLoading, mutate } = useSWR<IssueDetail>(iid ? `/issues/${iid}` : null, swrFetcher, { refreshInterval: 12000 });
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string[]>([]);
  const [editLabels, setEditLabels] = useState(false);

  if (isLoading || !issue) return <Spinner label="Loading issue…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const isManager = issue.myRole ? roleAtLeast(issue.myRole, 'MANAGER') : false;
  const isAssignee = issue.assignee?.id === user?.id;
  const canEditAll = isManager;

  const patch = async (payload: Record<string, unknown>, label?: string) => {
    setBusy(true);
    try {
      await api.patch(`/issues/${iid}`, payload);
      toast.push('success', label ?? 'Issue updated');
      await mutate();
      mutateProject();
      return true;
    } catch (e: any) {
      toast.push('error', 'Update failed', errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sections: Array<{ title: string; body?: string | null }> = [
    { title: 'Environment', body: issue.environment },
    { title: 'Steps to reproduce', body: issue.stepsToReproduce },
    { title: 'Expected result', body: issue.expectedResult },
    { title: 'Actual result', body: issue.actualResult },
  ].filter((s) => s.body && s.body.trim());

  return (
    <div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="flex gap-sm mb">
            <span className="mono badge badge-accent">{issue.key}</span>
            <IssueTypeBadge type={issue.type} />
            <IssueStatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
            <span className="chip"><Flag style={{ width: 11 }} /> {issue.severity.toLowerCase()} severity</span>
            <span className="dim" style={{ fontSize: 12 }}>Updated {timeAgo(issue.updatedAt)}</span>
          </div>
          <h1 className="page-title" style={{ overflowWrap: 'anywhere' }}>{issue.title}</h1>
          <p className="page-sub">
            Reported by {issue.reporter?.name ?? '—'} · Created {fmtDateTime(issue.createdAt)}
            {issue.resolvedAt && <> · Resolved {timeAgo(issue.resolvedAt)}</>}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="soft" onClick={() => setAiOpen(true)}><Sparkles style={{ width: 14 }} /> AI analyze</Button>
          {isManager && (
            <Button variant="danger" onClick={async () => {
              if (confirm('Delete this issue permanently?')) {
                try {
                  await api.del(`/issues/${iid}`);
                  toast.push('success', `${issue.key} deleted`);
                  window.history.back();
                } catch (e: any) {
                  toast.push('error', 'Delete failed', e?.message);
                }
              }
            }}>
              <Trash2 style={{ width: 14 }} /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>Description</h3>
              {canEditAll && !editingDesc && (
                <button className="mini-btn" onClick={() => { setDescDraft(issue.description); setEditingDesc(true); }}><Pencil style={{ width: 12, marginRight: 3 }} /> Edit</button>
              )}
            </div>
            <div className="card-body">
              {editingDesc ? (
                <div className="stack">
                  <Textarea rows={6} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} autoFocus />
                  <div className="flex" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>Cancel</Button>
                    <Button size="sm" disabled={busy} onClick={async () => { if (await patch({ description: descDraft })) setEditingDesc(false); }}>Save</Button>
                  </div>
                </div>
              ) : issue.description ? (
                <div className="comment-content">{issue.description}</div>
              ) : (
                <div className="dim" style={{ fontSize: 13 }}>No description.</div>
              )}
            </div>
          </section>

          {sections.length > 0 && (
            <section className="card">
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sections.map((s) => (
                  <div key={s.title}>
                    <div className="section-title" style={{ marginBottom: 4 }}>{s.title}</div>
                    <div className="comment-content">{s.body}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {issue.relatedTasks.length > 0 && (
            <section className="card">
              <div className="card-head"><h3>Related tasks</h3></div>
              <div className="row-list">
                {issue.relatedTasks.map((t) => (
                  <Link key={t.id} href={`/projects/${pid}/tasks/${t.id}`} className="row-link">
                    <TaskStatusBadge status={t.status} compact />
                    <span className="mono dim" style={{ fontSize: 11.5, width: 70 }}>{t.key}</span>
                    <div className="row-main"><div className="row-title">{t.title}</div></div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h3>Discussion</h3></div>
            <div className="card-body">
              <CommentSection kind="issue" subjectId={iid} members={members} canComment={Boolean(project)} comments={issue.comments} onChanged={() => mutate()} />
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card card-pad">
            <div className="section-title">Details</div>
            <div className="stack" style={{ gap: 12 }}>
              <Rail label="Status">
                <Select value={issue.status} disabled={!canEditAll && !isAssignee} onChange={(e) => patch({ status: e.target.value }, `${issue.key} → ${e.target.value.replace('_', ' ')}`)}>
                  {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </Select>
              </Rail>
              <Rail label="Type">
                {canEditAll ? (
                  <Select value={issue.type} onChange={(e) => patch({ type: e.target.value })}>
                    {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                  </Select>
                ) : <IssueTypeBadge type={issue.type} />}
              </Rail>
              <Rail label="Priority">
                {canEditAll ? (
                  <Select value={issue.priority} onChange={(e) => patch({ priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                  </Select>
                ) : <PriorityBadge priority={issue.priority} />}
              </Rail>
              <Rail label="Severity">
                {canEditAll ? (
                  <Select value={issue.severity} onChange={(e) => patch({ severity: e.target.value })}>
                    {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                  </Select>
                ) : <span className="chip">{issue.severity.toLowerCase()}</span>}
              </Rail>
              <Rail label="Assignee">
                {canEditAll ? (
                  <Select value={issue.assignee?.id ?? ''} onChange={(e) => patch({ assignee: e.target.value || null }, e.target.value ? 'Issue assigned' : 'Unassigned')}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>)}
                  </Select>
                ) : (
                  <div className="flex"><Avatar user={issue.assignee} size="sm" /><span>{issue.assignee?.name ?? 'Unassigned'}</span></div>
                )}
              </Rail>
            </div>
          </section>

          <section className="card card-pad">
            <div className="section-title">Labels</div>
            {editLabels && canEditAll ? (
              <div className="stack">
                <LabelInput value={labelDraft} onChange={setLabelDraft} />
                <div className="flex">
                  <Button size="sm" disabled={busy} onClick={async () => { if (await patch({ labels: labelDraft })) { setEditLabels(false); setLabelDraft([]); } }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditLabels(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex" style={{ flexWrap: 'wrap', gap: 5 }}>
                {issue.labels.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No labels</span>}
                {issue.labels.map((l) => <span className="chip" key={l}>{l}</span>)}
                {canEditAll && <button className="mini-btn" onClick={() => { setLabelDraft(issue.labels); setEditLabels(true); }}><Pencil style={{ width: 12, marginRight: 3 }} /> Edit</button>}
              </div>
            )}
          </section>
        </aside>
      </div>

      <IssueAnalyzerModal open={aiOpen} onClose={() => setAiOpen(false)} projectId={pid} initial={issue} />
    </div>
  );
}

function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
