'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CornerDownRight, Pencil, Reply, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { CommentItem, Member } from '@/lib/types';
import { Avatar, Button, useToast } from '@/components/ui';
import { cx, timeAgo } from '@/lib/format';

type Props = {
  kind: 'task' | 'issue';
  subjectId: string;
  members: Member[];
  canComment: boolean;
  comments: CommentItem[];
  /** Re-fetches the parent entity (which embeds comments) after a mutation. */
  onChanged: () => Promise<unknown> | void;
};

/** Renders comment text, turning @mentions into highlighted spans. */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9_]{2,24})/gi);
  return (
    <>
      {parts.map((p, i) =>
        /^@[a-z0-9_]{2,24}$/i.test(p) ? (
          <span key={i} className="mention">@{p.slice(1)}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export default function CommentSection({ kind, subjectId, members, canComment, comments, onChanged }: Props) {
  const toast = useToast();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const addComment = async (content: string, parentId: string | null) => {
    try {
      await api.post(`/${kind === 'task' ? 'tasks' : 'issues'}/${subjectId}/comments`, { content, parentId });
      setReplyingTo(null);
      toast.push('success', parentId ? 'Reply added' : 'Comment added');
      await onChanged();
    } catch (e: any) {
      toast.push('error', 'Could not add comment', e?.message);
    }
  };

  const saveEdit = async (id: string, content: string) => {
    try {
      await api.patch(`/comments/${id}`, { content });
      setEditingId(null);
      toast.push('success', 'Comment updated');
      await onChanged();
    } catch (e: any) {
      toast.push('error', 'Could not update comment', e?.message);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/comments/${id}`);
      toast.push('success', 'Comment deleted');
      await onChanged();
    } catch (e: any) {
      toast.push('error', 'Could not delete comment', e?.message);
    }
  };

  const rootComments = comments.filter((c) => !c.parentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  return (
    <div className="stack">
      {comments.length === 0 && <div className="dim" style={{ padding: '6px 0' }}>No comments yet — start the discussion.</div>}
      {rootComments.map((c) => (
        <div key={c.id}>
          <CommentRow
            comment={c}
            editing={editingId === c.id}
            onStartEdit={() => setEditingId(c.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(content) => saveEdit(c.id, content)}
            onDelete={() => remove(c.id)}
            onReply={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
            members={members}
          />
          {replyingTo === c.id && (
            <div style={{ marginLeft: 46, marginTop: 8 }}>
              <Composer members={members} placeholder="Reply…" submitLabel="Reply" onSubmit={(content) => addComment(content, c.id)} onCancel={() => setReplyingTo(null)} />
            </div>
          )}
          {replies(c.id).map((r) => (
            <div key={r.id} style={{ marginLeft: 46, marginTop: 10 }}>
              <CommentRow
                comment={r}
                editing={editingId === r.id}
                onStartEdit={() => setEditingId(r.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(content) => saveEdit(r.id, content)}
                onDelete={() => remove(r.id)}
                onReply={null}
                members={members}
                isReply
              />
            </div>
          ))}
        </div>
      ))}

      {canComment && (
        <div className="mt">
          <Composer members={members} placeholder="Add a comment… use @username to mention someone" submitLabel="Comment" onSubmit={(content) => addComment(content, null)} />
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onReply,
  members,
  isReply,
}: {
  comment: CommentItem;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (content: string) => void;
  onDelete: () => void;
  onReply: (() => void) | null;
  members: Member[];
  isReply?: boolean;
}) {
  const [showDelete, setShowDelete] = useState(false);
  return (
    <div className="comment">
      <Avatar user={comment.author} size="sm" />
      <div className="comment-body">
        <div className="comment-meta">
          <Link href={`/members/${comment.author?.id}`} className="muted" style={{ fontWeight: 600 }}>{comment.author?.name ?? 'Unknown'}</Link>
          <span>@{comment.author?.username}</span>
          <span title={comment.createdAt}>{timeAgo(comment.createdAt)}</span>
          {comment.editedAt && <span className="dim">· edited</span>}
          {isReply && <CornerDownRight style={{ width: 12 }} />}
        </div>
        {editing ? (
          <div>
            <Composer
              members={members}
              placeholder=""
              submitLabel="Save"
              initial={comment.content}
              onSubmit={onSave}
              onCancel={onCancelEdit}
            />
          </div>
        ) : (
          <div className="comment-box">
            <div className="comment-content"><MentionText text={comment.content} /></div>
          </div>
        )}
        <div className="comment-actions">
          {!editing && onReply && <button className="mini-btn" onClick={onReply}><Reply style={{ width: 12, marginRight: 3 }} /> Reply</button>}
          {!editing && onStartEdit && (
            <button className="mini-btn" onClick={onStartEdit}><Pencil style={{ width: 12, marginRight: 3 }} /> Edit</button>
          )}
          {!editing && onDelete && (
            <button className="mini-btn danger" onClick={() => (showDelete ? onDelete() : setShowDelete(true))}>
              <Trash2 style={{ width: 12, marginRight: 3 }} /> {showDelete ? 'Confirm?' : 'Delete'}
            </button>
          )}
          {!editing && showDelete && <button className="mini-btn" onClick={() => setShowDelete(false)}><X style={{ width: 12 }} /></button>}
        </div>
      </div>
    </div>
  );
}

/** Textarea with a live @mention suggestion popover. */
function Composer({
  members,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  initial,
}: {
  members: Member[];
  placeholder: string;
  submitLabel: string;
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  initial?: string;
}) {
  const [text, setText] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const candidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => (m.username.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) && m.username).slice(0, 6);
  }, [mentionQuery, members]);

  const update = (value: string) => {
    setText(value);
    const at = value.lastIndexOf('@', taRef.current?.selectionStart ?? value.length);
    if (at !== -1) {
      const between = value.slice(at + 1, taRef.current?.selectionStart ?? value.length);
      if (between.length <= 24 && !/[\s@]/.test(between)) setMentionQuery(between);
      else setMentionQuery(null);
    } else setMentionQuery(null);
  };

  const insertMention = (username: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const at = text.lastIndexOf('@', pos);
    const next = text.slice(0, at) + `@${username} ` + text.slice(pos);
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = next.indexOf(' ', at) + 1;
      ta.setSelectionRange(caret, caret);
    });
  };

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText('');
      setMentionQuery(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {candidates.length > 0 && (
          <div className="menu menu-left" style={{ position: 'absolute', bottom: '100%', top: 'auto', marginBottom: 6, width: 230, zIndex: 70 }}>
            {candidates.map((m) => (
              <button key={m.id} className="menu-item" onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}>
                <Avatar user={m} size="sm" />
                <span>{m.name}</span>
                <span className="dim">@{m.username}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          className="textarea"
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') setMentionQuery(null);
          }}
          aria-label="Comment"
        />
      </div>
      <div className="flex mt" style={{ justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button size="sm" disabled={busy || !text.trim()} onClick={submit}>
          <Check style={{ width: 13 }} /> {submitLabel}
        </Button>
      </div>
    </div>
  );
}
