'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Github, Link2, Search, Unplug } from 'lucide-react';
import { api, swrFetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/hooks';
import type { GithubStatus, ProjectSummary } from '@/lib/types';
import { Button, EmptyState, ErrorState, Input, Menu, MenuItem, Spinner, useToast } from '@/components/ui';
import { cx } from '@/lib/format';

type SearchItem = { fullName: string; htmlUrl: string; description: string; stars: number; defaultBranch: string };
type Browse = { repos: Array<{ fullName: string; defaultBranch: string; description: string; stars: number; language: string | null; htmlUrl: string }> };

export default function WorkspaceGithubPage() {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const { data: status, error: statusError, mutate: mutateStatus } = useSWR<GithubStatus>('/github/status', swrFetcher, { refreshInterval: 30000 });
  const [tab, setTab] = useState<'browse' | 'search'>('browse');
  const [q, setQ] = useState('');
  const [browse, setBrowse] = useState<Browse['repos'] | null>(null);
  const [results, setResults] = useState<SearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: projects } = useSWR<ProjectSummary[]>(workspace ? `/projects?workspace=${workspace.id}` : null, swrFetcher);

  const connect = async () => {
    try {
      const r = await api.get<{ url: string }>('/github/connect');
      window.location.href = r.url;
    } catch (e: any) {
      toast.push('error', 'Cannot start GitHub OAuth', e?.message);
    }
  };

  const disconnect = async () => {
    await api.del('/github/account');
    toast.push('success', 'GitHub account disconnected');
    mutateStatus();
  };

  const loadBrowse = async () => {
    setLoading(true);
    try {
      const r = await api.get<Browse>('/github/repos/browse');
      setBrowse(r.repos);
    } catch (e: any) {
      toast.push('error', 'Could not load repositories', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const search = async () => {
    if (q.trim().length < 2) return;
    setLoading(true);
    try {
      const r = await api.get<{ items: SearchItem[] }>(`/github/search?q=${encodeURIComponent(q)}`);
      setResults(r.items);
      setBrowse(null);
    } catch (e: any) {
      toast.push('error', 'Search failed', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const linkRepoToProject = async (projectId: string, fullName: string, defaultBranch: string) => {
    try {
      await api.post(`/projects/${projectId}/github-repos`, { fullName, defaultBranch });
      toast.push('success', `${fullName} linked to a project`);
    } catch (e: any) {
      toast.push('error', 'Link failed', e?.message);
    }
  };

  if (!status) return <Spinner label="Checking GitHub status…" />;
  if (statusError) return <ErrorState message={statusError.message} />;
  const account = status.account;
  const items = tab === 'browse' ? (browse ?? []).map((r) => ({ fullName: r.fullName, defaultBranch: r.defaultBranch, description: r.description, stars: r.stars, htmlUrl: r.htmlUrl })) : results ?? [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">GitHub</h1>
          <p className="page-sub">Connect your GitHub account, explore repositories and link them to projects.</p>
        </div>
      </div>

      {!status.serverConfigured && (
        <div className="chip mb" style={{ borderStyle: 'dashed', padding: '8px 14px' }}>
          <Github style={{ width: 15 }} /> GitHub API is not configured on this server — add GITHUB_TOKEN and the OAuth env vars to enable real data.
        </div>
      )}

      <section className="card card-pad mb">
        <div className="flex" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="flex gap-lg">
            <Github style={{ width: 26, height: 26, color: 'var(--text-2)' }} />
            <div>
              <div style={{ fontWeight: 700 }}>{account ? `Connected as ${account.username}` : 'GitHub account'}</div>
              <div className="dim" style={{ fontSize: 12.5 }}>
                {account
                  ? <>Connected {new Date(account.connectedAt).toLocaleDateString()} · scope: repo · <span className="badge badge-green">active</span></>
                  : status.oauthConfigured ? 'Connect to search your repositories and read private data with generous rate limits.' : 'OAuth is not configured on the server. A server-level token still powers public data.'}
              </div>
            </div>
          </div>
          <div className="flex gap-sm">
            {account && (
              <Button variant="ghost" onClick={disconnect}><Unplug style={{ width: 14 }} /> Disconnect</Button>
            )}
            {!account && status.oauthConfigured && (
              <Button variant="primary" onClick={connect}><Link2 style={{ width: 14 }} /> Connect GitHub</Button>
            )}
            {!account && !status.oauthConfigured && (
              <a className="btn" href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">Create a token <ExternalLink style={{ width: 13 }} /></a>
            )}
          </div>
        </div>
      </section>

      <div className="flex mb" style={{ gap: 6 }}>
        <button className={cx('btn btn-sm', tab === 'browse' ? 'btn-soft' : 'btn-ghost')} onClick={() => { setTab('browse'); setResults(null); loadBrowse(); }}>My repositories</button>
        <button className={cx('btn btn-sm', tab === 'search' ? 'btn-soft' : 'btn-ghost')} onClick={() => { setTab('search'); setBrowse(null); }}>Search GitHub</button>
      </div>

      {tab === 'browse' && !browse && !loading && (
        <div className="muted center" style={{ padding: 20 }}>
          <Button onClick={loadBrowse}><Github style={{ width: 14 }} /> Load repositories</Button>
          {!account && <div className="dim mt" style={{ fontSize: 12 }}>Requires a connected account or server GITHUB_TOKEN.</div>}
        </div>
      )}

      {tab === 'search' && (
        <div className="filter-bar">
          <div className="flex" style={{ flex: 1, minWidth: 200 }}>
            <Search style={{ width: 15, color: 'var(--text-3)', marginLeft: 10 }} />
            <Input placeholder="Search public repositories…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()} style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 4 }} aria-label="Search repositories" />
          </div>
          <Button variant="soft" size="sm" onClick={search} disabled={loading || q.trim().length < 2}>Search</Button>
        </div>
      )}

      {loading && <Spinner label="Loading…" />}
      {!loading && tab === 'browse' && browse && browse.length === 0 && <EmptyState title="No repositories" sub="Nothing was returned for your GitHub account." />}
      {!loading && items.length > 0 && (
        <div className="card">
          <div className="row-list">
            {items.map((r) => (
              <div key={r.fullName} className="flex" style={{ gap: 12, padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="flex gap-sm">
                    <a href={r.htmlUrl ?? `https://github.com/${r.fullName}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 13.5 }}>
                      {r.fullName} <ExternalLink style={{ width: 11, display: 'inline' }} />
                    </a>
                    {r.stars > 0 && <span className="chip">★ {r.stars}</span>}
                  </div>
                  {r.description && <div className="row-sub">{r.description}</div>}
                </div>
                {(projects?.length ?? 0) > 0 && (
                  <Menu label="Link to project" button={<Button size="sm" variant="soft"><Link2 style={{ width: 13 }} /> Link</Button>}>
                    <div className="menu-label">Link to project</div>
                    {projects!.map((p) => (                        <MenuItem key={p.id} onClick={() => linkRepoToProject(p.id, r.fullName, r.defaultBranch ?? 'main')}>
                        {p.key} · {p.name}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && tab === 'search' && results !== null && results.length === 0 && <div className="dim center" style={{ padding: 18 }}>No repositories matched “{q}”.</div>}
    </div>
  );
}
