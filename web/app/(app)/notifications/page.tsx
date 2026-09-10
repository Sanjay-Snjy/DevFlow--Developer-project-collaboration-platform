'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { Bell, BellOff, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import type { NotificationItem } from '@/lib/types';
import { Avatar, Button, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui';
import { cx, timeAgo } from '@/lib/format';

type Resp = { items: NotificationItem[]; total: number; unread: number; page: number; limit: number };

const TYPE_LABEL: Record<string, string> = {
  task_assigned: 'Task assigned',
  issue_assigned: 'Issue assigned',
  task_status: 'Status change',
  comment: 'New comment',
  mention: 'Mention',
  member_added: 'Workspace',
  project_added: 'Project',
  workspace_invite: 'Invitation',
  github_activity: 'GitHub',
  ai_complete: 'AI',
};

export default function NotificationsPage() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useSWR<Resp>(`/notifications?page=${page}&limit=30`, swrFetcher, { refreshInterval: 20000 });

  const reload = () => {
    mutate('/notifications');
    mutate('/notifications/unread-count');
  };

  const markRead = async (id: string) => {
    await api.post(`/notifications/${id}/read`);
    reload();
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      toast.push('success', 'All notifications marked as read');
      reload();
    } catch (e: any) {
      toast.push('error', 'Update failed', e?.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">{data?.unread ?? '—'} unread · {data?.total ?? '—'} total</p>
        </div>
        {(data?.unread ?? 0) > 0 && (
          <Button variant="ghost" onClick={markAll}><CheckCheck style={{ width: 14 }} /> Mark all as read</Button>
        )}
      </div>

      {isLoading && !data && <Spinner label="Loading notifications…" />}
      {error && <ErrorState message={error.message} />}
      {!isLoading && !error && data && data.items.length === 0 && (
        <EmptyState icon={<Bell />} title="No notifications" sub="Assigned tasks, mentions and updates will land here." />
      )}

      {data && data.items.length > 0 && (
        <div className="card">
          <div className="row-list">
            {data.items.map((n) => (
              <div key={n.id} className={cx('flex', !n.readAt && 'notif-item-unread')} style={{ gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: n.readAt ? undefined : 'var(--accent-soft)' }}>
                <Avatar user={n.actor} size="sm" />
                <Link href={n.link || '/notifications'} className="grow" style={{ minWidth: 0 }} onClick={() => !n.readAt && markRead(n.id)}>
                  <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</span>
                    <span className="chip" style={{ fontSize: 10.5 }}>{TYPE_LABEL[n.type] ?? n.type.replace('_', ' ')}</span>
                  </div>
                  {n.body && <div className="row-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                  <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>{timeAgo(n.createdAt)}</div>
                </Link>
                {n.readAt ? <BellOff style={{ width: 14, color: 'var(--text-3)' }} /> : (
                  <button className="mini-btn" onClick={() => markRead(n.id)} aria-label="Mark as read"><CheckCheck style={{ width: 14 }} /></button>
                )}
              </div>
            ))}
          </div>
          <div className="flex" style={{ justifyContent: 'space-between', padding: 12 }}>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft style={{ width: 14 }} /> Previous</Button>
            <span className="dim" style={{ fontSize: 12.5 }}>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span>
            <Button variant="ghost" size="sm" disabled={data.items.length < data.limit} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight style={{ width: 14 }} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
