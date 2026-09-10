'use client';

import Link from 'next/link';
import { CalendarDays, CheckCircle2, MessageSquare, Swords } from 'lucide-react';
import { ISSUE_STATUS_META, ISSUE_TYPES, PRIORITY_META, TYPE_META, type IssueStatus, type IssueType, type Priority, type TaskStatus } from '@/lib/constants';
import { cx, fmtDate, timeAgo } from '@/lib/format';
import type { ActivityItem, Task } from '@/lib/types';
import { Avatar } from '@/components/ui';

export function PriorityBadge({ priority }: { priority?: Priority | null }) {
  if (!priority) return null;
  const meta = PRIORITY_META[priority];
  return (
    <span className="badge badge-soft" title={`${meta.label} priority`}>
      <span className="dot" style={{ background: meta.dot }} />
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}

const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  TODO: 'badge-soft',
  IN_PROGRESS: 'badge-blue',
  IN_REVIEW: 'badge-violet',
  BLOCKED: 'badge-red',
  DONE: 'badge-green',
};

const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  TODO: 'var(--text-3)',
  IN_PROGRESS: 'var(--sky)',
  IN_REVIEW: 'var(--violet)',
  BLOCKED: 'var(--red)',
  DONE: 'var(--green)',
};

export function TaskStatusBadge({ status, compact }: { status: TaskStatus; compact?: boolean }) {
  const label = status.replace('_', ' ');
  if (compact) {
    return <span className="dot" style={{ background: TASK_STATUS_DOT[status] }} title={label} />;
  }
  return (
    <span className={cx('badge', TASK_STATUS_BADGE[status])}>
      <span className="dot" style={{ background: TASK_STATUS_DOT[status] }} />
      {label}
    </span>
  );
}

export function IssueTypeBadge({ type }: { type: IssueType }) {
  const cls: Record<IssueType, string> = { BUG: 'badge-red', FEATURE: 'badge-blue', IMPROVEMENT: 'badge-violet', QUESTION: 'badge-amber' };
  return <span className={cx('badge', cls[type])}>{TYPE_META[type]}</span>;
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const cls: Record<IssueStatus, string> = { OPEN: 'badge-red', IN_PROGRESS: 'badge-blue', RESOLVED: 'badge-green', CLOSED: 'badge-soft' };
  return <span className={cx('badge', cls[status])}>{ISSUE_STATUS_META[status]}</span>;
}

export function DueChip({ due }: { due?: string | null }) {
  if (!due) return null;
  const overdue = new Date(due).getTime() < Date.now();
  return (
    <span className={cx('chip', overdue && 'badge-red')} title={`Due ${fmtDate(due)}`}>
      <CalendarDays style={{ width: 11 }} />
      {overdue ? 'overdue' : fmtDate(due, { month: 'short', day: 'numeric' })}
    </span>
  );
}

export function TaskRow({ task, sub, projectId }: { task: Task; sub?: boolean; projectId: string }) {
  const pid = projectId || (typeof task.project === 'string' ? task.project : '');
  return (
    <Link href={`/projects/${pid}/tasks/${task.id}`} className={cx('row-link', sub && 'tc-sub')}>
      <span className="mono dim" style={{ fontSize: 11.5, width: 64, flex: 'none' }}>{task.key}</span>
      <span className="row-main">
        <span className="row-title">{task.title}</span>
      </span>
      {task.dueDate && <DueChip due={task.dueDate} />}
      <TaskStatusBadge status={task.status} compact />
      <span className="chip">{task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}</span>
      {task.subtaskCount ? (
        <span className="chip" title="Subtasks"><Swords style={{ width: 11 }} /> {task.subtaskCount}</span>
      ) : null}
      <span className="chip" title="Comments"><MessageSquare style={{ width: 11 }} /> {task.commentCount ?? 0}</span>
      <Avatar user={task.assignee} size="sm" />
    </Link>
  );
}

export function ActivityFeed({ items, dense }: { items: ActivityItem[]; dense?: boolean }) {
  if (!items.length) return <div className="dim center" style={{ padding: 20 }}>No activity yet.</div>;
  return (
    <div className="feed">
      {items.map((a) => (
        <div className="feed-item" key={a.id}>
          <Avatar user={a.actor} size={dense ? 'sm' : undefined} />
          <div className="feed-main">
            <div className="feed-text">
              <strong>{a.actor?.name ?? 'Someone'}</strong> {a.title}
            </div>
            <div className="feed-time">
              {timeAgo(a.createdAt)}
              {a.project && (
                <Link href={`/projects/${a.project.id}`} style={{ color: 'var(--accent)' }}>
                  {' '}· {a.project.key}
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyCheck({ label }: { label: string }) {
  return (
    <div className="flex" style={{ gap: 8, justifyContent: 'center', padding: 26, color: 'var(--text-3)' }}>
      <CheckCircle2 style={{ width: 18 }} />
      <span>{label}</span>
    </div>
  );
}
