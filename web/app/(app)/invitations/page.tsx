'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Check, Mail, X } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/constants';
import type { Role } from '@/lib/constants';
import { Button, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui';
import { cx, timeAgo } from '@/lib/format';

type Invite = { id: string; workspace: { id: string; name: string; slug: string; logoUrl: string } | null; role: Role; expiresAt: string; createdAt: string };

export default function InvitationsPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<Invite[]>('/invitations', swrFetcher);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') ?? '';
    setToken(t);
    if (t) {
      setBusy(true);
      api
        .post('/invitations/accept', { token: t })
        .then(() => {
          toast.push('success', 'Invitation accepted — welcome to the team!');
          router.replace('/dashboard');
        })
        .catch((e: any) => {
          toast.push('error', 'Could not accept invitation', e?.message);
          setBusy(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading && !data) return <Spinner label="Loading invitations…" />;
  if (error) return <ErrorState message={error.message} />;

  const accept = async (token?: string) => {
    // Accepting an item from the list requires the shareable token, which only appears when
    // the admin creates it. If none is present, point the user at the invite link.
    if (token) {
      setBusy(true);
      try {
        await api.post('/invitations/accept', { token });
        toast.push('success', 'Invitation accepted');
        mutate();
      } catch (e: any) {
        toast.push('error', 'Accept failed', e?.message);
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Invitations</h1>
          <p className="page-sub">Workspace invites sent to your email.</p>
        </div>
      </div>

      {busy && <Spinner label="Processing invitation…" />}
      {!busy && (!data || data.length === 0) && (
        <EmptyState icon={<Mail />} title="No pending invitations" sub="When a workspace admin invites you, the invite shows up here and in your notifications." />
      )}

      {!busy && data && data.length > 0 && (
        <div className="stack">
          {token && (
            <div className="chip" style={{ borderColor: 'var(--accent)', padding: '8px 12px' }}>
              <Check style={{ width: 14 }} /> Invite token found — accept it by pasting it from the invite email.
            </div>
          )}
          {data.map((inv) => (
            <section key={inv.id} className="card card-pad flex" style={{ justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.workspace?.name ?? 'A workspace'}</div>
                <div className="dim" style={{ fontSize: 12.5 }}>Role: {ROLE_LABEL[inv.role]} · Sent {timeAgo(inv.createdAt)} · Expires {timeAgo(inv.expiresAt)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>Accepting gives you access to the workspace and its projects.</div>
              </div>
              <div className="flex gap-sm">
                <Button variant="ghost" onClick={async () => {
                  try {
                    await api.post(`/invitations/${inv.id}/decline`);
                    toast.push('success', 'Invitation declined');
                    mutate();
                  } catch (e: any) {
                    toast.push('error', 'Could not decline', e?.message);
                  }
                }}><X style={{ width: 14 }} /> Decline</Button>
                <Button variant="primary" disabled={!token || busy} onClick={() => accept(token)}><Check style={{ width: 14 }} /> Accept</Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
