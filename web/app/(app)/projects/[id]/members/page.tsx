'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckCircle2, ListTodo, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { ROLE_LABEL, roleAtLeast, type Role } from '@/lib/constants';
import type { Member, WorkspaceDetail } from '@/lib/types';
import { useProject } from '@/features/project/project-shell';
import { Avatar, Button, Confirm, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui';
import { cx } from '@/lib/format';

type Resp = {
  members: Array<Member & { openTasks: number; doneTasks: number }>;
  workspaceMembers: Array<{ userId: string; role: Role; joinedAt?: string | null }>;
  projectMemberIds: string[];
  myRole: Role;
};

export default function ProjectMembersPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const { project } = useProject(pid);
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<Resp>(pid ? `/projects/${pid}/members` : null, swrFetcher);
  const { data: ws } = useSWR<WorkspaceDetail>(project?.workspace?.id ? `/workspaces/${project.workspace.id}` : null, swrFetcher);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const roleMap = useMemo(() => new Map((data?.workspaceMembers ?? []).map((w) => [w.userId, w.role])), [data]);
  const memberOfProject = useMemo(() => new Set(data?.projectMemberIds ?? []), [data]);
  const canManage = project ? roleAtLeast(project.myRole, 'MANAGER') : false;

  if (isLoading && !data) return <Spinner label="Loading members…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;

  const candidates = (ws?.members ?? []).filter((m) => !memberOfProject.has(m.id));

  const addMembers = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await api.post(`/projects/${pid}/members`, { userIds: [...selected] });
      toast.push('success', 'Members added to the project');
      setAdding(false);
      setSelected(new Set());
      mutate();
    } catch (e: any) {
      toast.push('error', 'Could not add members', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.del(`/projects/${pid}/members/${removing.id}`);
      toast.push('success', `${removing.name} removed from the project`);
      mutate();
    } catch (e: any) {
      toast.push('error', 'Could not remove member', e?.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-sub">{data?.members.length ?? '—'} people working on {project?.key ?? ''}.</p>
        </div>
        {canManage && <Button variant="primary" onClick={() => setAdding(true)}><Plus /> Add members</Button>}
      </div>

      {data?.members.length === 0 ? (
        <EmptyState icon={<Users />} title="No members yet" sub="Add workspace members to this project so they can see and work on it." />
      ) : (
        <div className="card">
          <div className="row-list">
            {data?.members.map((m) => (
              <div key={m.id} className="flex" style={{ gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                <Avatar user={m} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="flex gap-sm">
                    <Link href={`/members/${m.id}`} style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</Link>
                    <span className="dim">@{m.username}</span>
                    <span className="badge badge-soft">{ROLE_LABEL[roleMap.get(m.id) ?? 'VIEWER']}</span>
                    {String(project?.owner?.id) === m.id && <span className="badge badge-accent">owner</span>}
                  </div>
                  {m.skills?.length ? <div className="row-sub">{m.skills.slice(0, 5).join(' · ')}</div> : <div className="row-sub">{m.email}</div>}
                </div>
                <div className="flex" style={{ gap: 14, color: 'var(--text-2)', fontSize: 12.5 }}>
                  <span title="Open tasks"><ListTodo style={{ width: 13, display: 'inline' }} /> {m.openTasks}</span>
                  <span title="Completed"><CheckCircle2 style={{ width: 13, display: 'inline' }} /> {m.doneTasks}</span>
                </div>
                {canManage && String(project?.owner?.id) !== m.id && (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}><Trash2 style={{ width: 13 }} /></Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head"><h3>Add workspace members</h3></div>
            <div className="modal-body">
              {candidates.length === 0 && (
                <EmptyState icon={<UserRound />} title="Everyone is already a member" sub="Invite more people to the workspace from Settings → Workspace first." />
              )}
              {candidates.map((m) => (
                <label key={m.id} className="flex" style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={(e) => setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(m.id); else next.delete(m.id);
                    return next;
                  })} aria-label={`Add ${m.name}`} />
                  <Avatar user={m} size="sm" />
                  <span className="grow" style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</span>
                  <span className="dim" style={{ fontSize: 12 }}>@{m.username}</span>
                </label>
              ))}
            </div>
            <div className="modal-foot">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button variant="primary" disabled={busy || selected.size === 0} onClick={addMembers}>Add {selected.size || ''} member{selected.size === 1 ? '' : 's'}</Button>
            </div>
          </div>
        </div>
      )}

      <Confirm open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={removeMember}
        title={`Remove ${removing?.name}?`}
        message="They lose access to this project. Their open tasks become unassigned."
        confirmLabel="Remove" danger />
    </div>
  );
}
