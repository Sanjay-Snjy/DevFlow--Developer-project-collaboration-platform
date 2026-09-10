'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Github, Link2, Plus, Search, Unlink } from 'lucide-react';
import { api, qs, swrFetcher } from '@/lib/api';
import { roleAtLeast } from '@/lib/constants';
import { useProject } from '@/features/project/project-shell';
import RepoExplorer from '@/features/github/repo-explorer';
import { Button, EmptyState, ErrorState, Field, Input, Modal, Spinner, useToast } from '@/components/ui';
import { cx } from '@/lib/format';
import type { GithubStatus } from '@/lib/types';

type SearchResult = { fullName: string; htmlUrl: string; description: string; stars: number; defaultBranch: string };
type BrowseResult = { repos: Array<{ fullName: string; defaultBranch: string; description: string; stars: number; language: string | null }> };

export default function ProjectGithubPage() {
  const params = useParams<{ id: string }>();
  const pid = params.id;
  const { project, mutate } = useProject(pid);
  const toast = useToast();
  const [selected, setSelected] = useState<string>('');
  const [linkOpen, setLinkOpen] = useState(false);
  const { data: status } = useSWR<GithubStatus>('/github/status', swrFetcher);

  if (!project) return <Spinner label="Loading project…" />;
  const canManage = roleAtLeast(project.myRole, 'MANAGER');
  const repos = project.repositories ?? [];

  const unlink = async (fullName: string) => {
    try {
      await api.del(`/projects/${pid}/github-repos`, { fullName });
      toast.push('success', `Unlinked ${fullName}`);
      if (selected === fullName) setSelected('');
      mutate();
    } catch (e: any) {
      toast.push('error', 'Unlink failed', e?.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">GitHub</h1>
          <p className="page-sub">Repositories linked to {project.key} and their live activity.</p>
        </div>
        {canManage && <Button variant="primary" onClick={() => setLinkOpen(true)}><Link2 style={{ width: 14 }} /> Link repository</Button>}
      </div>

      {!status?.serverConfigured && (
        <div className="chip mb" style={{ borderStyle: 'dashed', padding: '6px 12px' }}>
          <Github style={{ width: 14 }} /> GitHub API is not configured on this server (GITHUB_TOKEN / OAuth env vars).
        </div>
      )}

      {repos.length === 0 ? (
        <EmptyState
          icon={<Github />}
          title="No repositories linked"
          sub="Link a GitHub repository to see its commits, pull requests and issues here."
          action={canManage ? <Button variant="primary" onClick={() => setLinkOpen(true)}><Plus /> Link repository</Button> : undefined}
        />
      ) : (
        <div className="stack">
          <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
            {repos.map((r) => (
              <button key={r.fullName} className={cx('chip', 'btn-sm', selected === r.fullName && 'btn-soft')} onClick={() => setSelected(r.fullName)}
                style={{ cursor: 'pointer', fontFamily: 'var(--mono)' }}>
                {r.fullName}
              </button>
            ))}
          </div>
          {selected ? (
            <RepoExplorer fullName={selected} />
          ) : (
            <div className="card card-pad">
              <p className="muted" style={{ fontSize: 13.5 }}>Select a repository above to view its activity.</p>
              <div className="flex mt gap-sm" style={{ flexWrap: 'wrap' }}>
                {repos.map((r) => (
                  <span key={r.fullName} className="chip">{r.fullName}</span>
                ))}
              </div>
            </div>
          )}
          {canManage && (
            <div className="card card-pad" style={{ borderColor: 'rgba(248,113,113,.3)' }}>
              <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Manage links</div>
                  <div className="dim" style={{ fontSize: 12 }}>Unlink a repository to stop showing its data here. The repo itself is untouched.</div>
                </div>
                <div className="flex gap-sm">
                  {repos.slice(0, 6).map((r) => (
                    <Button key={r.fullName} variant="ghost" size="sm" onClick={() => unlink(r.fullName)} title={`Unlink ${r.fullName}`}>
                      <Unlink style={{ width: 13 }} /> {r.fullName.split('/')[1]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <LinkRepoModal open={linkOpen} onClose={() => setLinkOpen(false)} projectId={pid} onLinked={() => mutate()} hasAccount={Boolean(status?.account || status?.serverConfigured)} />
    </div>
  );
}

function LinkRepoModal({ open, onClose, projectId, onLinked, hasAccount }: { open: boolean; onClose: () => void; projectId: string; onLinked: () => void; hasAccount: boolean }) {
  const toast = useToast();
  const [mode, setMode] = useState<'browse' | 'search'>('browse');
  const [q, setQ] = useState('');
  const [browse, setBrowse] = useState<BrowseResult['repos'] | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState('');

  const loadBrowse = async () => {
    setBusy(true);
    try {
      const r = await api.get<BrowseResult>('/github/repos/browse');
      setBrowse(r.repos);
      setResults(null);
    } catch (e: any) {
      toast.push('error', 'Could not load repositories', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await api.get<{ items: SearchResult[] }>(`/github/search${qs({ q })}`);
      setResults(r.items);
      setBrowse(null);
    } catch (e: any) {
      toast.push('error', 'Search failed', e?.message);
    } finally {
      setBusy(false);
    }
  };

  const link = async (fullName: string, defaultBranch: string) => {
    setLinking(fullName);
    try {
      await api.post(`/projects/${projectId}/github-repos`, { fullName, defaultBranch });
      toast.push('success', `${fullName} linked to the project`);
      onLinked();
      onClose();
    } catch (e: any) {
      toast.push('error', 'Link failed', e?.message);
    } finally {
      setLinking('');
    }
  };

  const items = mode === 'browse' ? (browse ?? []).map((r) => ({ fullName: r.fullName, defaultBranch: r.defaultBranch, description: r.description, stars: r.stars })) : results ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Link a GitHub repository" wide footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="flex mb" style={{ gap: 6 }}>
        <button className={cx('btn btn-sm', mode === 'browse' ? 'btn-soft' : 'btn-ghost')} onClick={() => { setMode('browse'); setResults(null); loadBrowse(); }}>My repositories</button>
        <button className={cx('btn btn-sm', mode === 'search' ? 'btn-soft' : 'btn-ghost')} onClick={() => { setMode('search'); setBrowse(null); }}>Search GitHub</button>
      </div>

      {mode === 'browse' && !browse && !busy && hasAccount && (
        <div className="dim center" style={{ padding: 16 }}><Button size="sm" onClick={loadBrowse}>Load my repositories</Button></div>
      )}
      {mode === 'browse' && !browse && !busy && !hasAccount && (
        <div className="muted" style={{ fontSize: 13 }}>Connect your GitHub account (Settings → Integrations) or use a server-level GITHUB_TOKEN to browse private repositories. Public repos can still be searched.</div>
      )}

      {mode === 'search' && (
        <div className="flex mb" style={{ gap: 6 }}>
          <div className="flex grow" style={{ flex: 1 }}>
            <Search style={{ width: 15, color: 'var(--text-3)', marginLeft: 10 }} />
            <Input placeholder="Search GitHub repositories…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()} style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 4 }} aria-label="Search GitHub" />
          </div>
          <Button size="sm" variant="soft" onClick={search} disabled={busy || q.trim().length < 2}>Search</Button>
        </div>
      )}

      {busy && <Spinner label="Loading…" />}
      {!busy && mode === 'browse' && browse && browse.length === 0 && <EmptyState title="No repositories found" sub="Nothing owned by your GitHub account was returned." />}
      {!busy && items.length > 0 && (
        <div className="card">
          <div className="row-list">
            {items.map((r) => (
              <div key={r.fullName} className="flex" style={{ gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="flex gap-sm">
                    <span className="mono" style={{ fontWeight: 700, fontSize: 13.5 }}>{r.fullName}</span>
                    {r.stars > 0 && <span className="chip">★ {r.stars}</span>}
                  </div>
                  {r.description && <div className="row-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</div>}
                </div>
                <Button size="sm" variant={linking === r.fullName ? 'ghost' : 'soft'} disabled={Boolean(linking)} onClick={() => link(r.fullName, (r as SearchResult).defaultBranch ?? 'main')}>
                  <Link2 style={{ width: 13 }} /> Link
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!busy && mode === 'search' && results !== null && results.length === 0 && <div className="dim center" style={{ padding: 18 }}>No repositories matched “{q}”.</div>}
    </Modal>
  );
}
