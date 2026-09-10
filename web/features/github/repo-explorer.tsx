'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { GitCommitHorizontal, GitPullRequest, GitFork, Star, AlertCircle, Bug, Users } from 'lucide-react';
import { swrFetcher } from '@/lib/api';
import { ErrorState, LoadingBox, Tabs } from '@/components/ui';
import { fmtDate, timeAgo } from '@/lib/format';

type RepoInfo = {
  fullName: string;
  description: string;
  htmlUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string | null;
  topics: string[];
};
type GhCommit = { sha: string; shortSha: string; message: string; author: { name: string; username: string | null; avatarUrl: string | null }; date: string | null };
type GhIssue = { number: number; title: string; state: string; htmlUrl: string; createdAt: string | null; user: { login: string; avatarUrl: string | null } | null; labels: string[]; comments: number };

type Tab = 'overview' | 'commits' | 'issues' | 'pulls' | 'contributors';

export default function RepoExplorer({ fullName }: { fullName: string }) {
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    setTab('overview');
  }, [fullName]);

  const { data: overview, error: overviewError } = useSWR<{ info: RepoInfo; authed: boolean }>(`/github/repos/overview?repo=${encodeURIComponent(fullName)}`, swrFetcher, { refreshInterval: 60000 });
  const { data: commits, error: commitsError } = useSWR<{ commits: GhCommit[] }>(tab === 'commits' ? `/github/repos/commits?repo=${encodeURIComponent(fullName)}` : null, swrFetcher);
  const { data: issues, error: issuesError } = useSWR<{ issues: GhIssue[] }>(tab === 'issues' ? `/github/repos/issues?repo=${encodeURIComponent(fullName)}` : null, swrFetcher);
  const { data: pulls, error: pullsError } = useSWR<{ pulls: GhIssue[] }>(tab === 'pulls' ? `/github/repos/pulls?repo=${encodeURIComponent(fullName)}` : null, swrFetcher);
  const { data: contributors } = useSWR<{ contributors: Array<{ login: string; avatarUrl: string | null; contributions: number }> }>(tab === 'contributors' ? `/github/repos/contributors?repo=${encodeURIComponent(fullName)}` : null, swrFetcher);

  const info = overview?.info;

  return (
    <div>
      {overviewError && tab === 'overview' && <ErrorState message={overviewError.message} />}
      {tab !== 'overview' && (
        <div className="flex mb" style={{ gap: 6 }}>
          {fullName && <span className="mono badge badge-soft">{fullName}</span>}
          {info?.defaultBranch && <span className="chip">{info.defaultBranch}</span>}
        </div>
      )}
      <Tabs
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'commits', label: 'Commits' },
          { key: 'issues', label: `Issues${info ? ` (${info.openIssues})` : ''}` },
          { key: 'pulls', label: 'Pull requests' },
          { key: 'contributors', label: 'Contributors' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {tab === 'overview' && (
        <div className="mt">
          {!overview && !overviewError && <LoadingBox rows={2} />}
          {info && (
            <div className="stack">
              <div className="card card-pad">
                <div className="flex" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <Link href={info.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800, fontSize: 16 }}>{info.fullName}</Link>
                    {info.description && <p className="muted mt" style={{ maxWidth: 640 }}>{info.description}</p>}
                    <div className="flex mt gap-sm" style={{ flexWrap: 'wrap' }}>
                      {info.language && <span className="chip">{info.language}</span>}
                      {info.topics.slice(0, 6).map((t) => <span className="chip" key={t}>{t}</span>)}
                    </div>
                  </div>
                  <div className="flex gap-lg" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                    <span><Star style={{ width: 14, display: 'inline' }} /> {info.stars}</span>
                    <span><GitFork style={{ width: 14, display: 'inline' }} /> {info.forks}</span>
                    <span><Bug style={{ width: 14, display: 'inline' }} /> {info.openIssues}</span>
                    {info.pushedAt && <span className="dim">pushed {timeAgo(info.pushedAt)}</span>}
                  </div>
                </div>
              </div>
              {overview?.authed === false && (
                <div className="chip" style={{ borderStyle: 'dashed' }}>Reading public data — connect a GitHub account (Settings → Integrations) for higher rate limits and private repos.</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'commits' && <Feed kind="commits" error={commitsError} loading={!commits && !commitsError} empty={!commitsError && commits?.commits.length === 0}>
        {(commits?.commits ?? []).map((c) => (
          <Row key={c.sha} icon={<GitCommitHorizontal style={{ width: 14 }} />}>
            <span className="mono dim" style={{ fontSize: 11.5 }}>{c.shortSha}</span>
            <span className="row-title" style={{ whiteSpace: 'normal' }}>{c.message}</span>
            <span className="chip">{c.author.username ?? c.author.name}</span>
            <span className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{c.date ? timeAgo(c.date) : ''}</span>
          </Row>
        ))}
      </Feed>}

      {tab === 'issues' && <Feed kind="issues" error={issuesError} loading={!issues && !issuesError} empty={!issuesError && issues?.issues.length === 0}>
        {(issues?.issues ?? []).map((i) => (
          <Row key={i.number} icon={<Bug style={{ width: 14 }} />}>
            <span className="mono dim" style={{ fontSize: 11.5 }}>#{i.number}</span>
            <Link href={i.htmlUrl} target="_blank" rel="noopener noreferrer" className="row-title">{i.title}</Link>
            <span className="chip">{i.user?.login ?? 'unknown'}</span>
            {i.labels.slice(0, 3).map((l) => <span className="chip" key={l}>{l}</span>)}
          </Row>
        ))}
      </Feed>}

      {tab === 'pulls' && <Feed kind="pulls" error={pullsError} loading={!pulls && !pullsError} empty={!pullsError && pulls?.pulls.length === 0}>
        {(pulls?.pulls ?? []).map((i) => (
          <Row key={i.number} icon={<GitPullRequest style={{ width: 14 }} />}>
            <span className="mono dim" style={{ fontSize: 11.5 }}>#{i.number}</span>
            <Link href={i.htmlUrl} target="_blank" rel="noopener noreferrer" className="row-title">{i.title}</Link>
            <span className={i.state === 'open' ? 'badge badge-green' : 'badge badge-soft'}>{i.state}</span>
            <span className="dim" style={{ fontSize: 11.5 }}>{i.comments} comments · {fmtDate(i.createdAt)}</span>
          </Row>
        ))}
      </Feed>}

      {tab === 'contributors' && (
        <div className="card mt">
          {(contributors?.contributors ?? []).map((c) => (
            <div key={c.login} className="flex" style={{ gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <Users style={{ width: 15, color: 'var(--text-3)' }} />
              <span style={{ fontWeight: 600 }}>{c.login}</span>
              <span className="dim" style={{ fontSize: 12 }}>{c.contributions} contributions</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Feed({ kind, children, loading, error, empty }: { kind: string; children: React.ReactNode; loading: boolean; error?: { message: string }; empty?: boolean }) {
  if (error) return <div className="mt"><ErrorState message={error.message} /></div>;
  if (loading) return <div className="mt"><LoadingBox rows={3} /></div>;
  if (empty) return <div className="dim center" style={{ padding: 30 }}>No {kind} to show.</div>;
  return <div className="card mt"><div className="row-list">{children}</div></div>;
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex" style={{ gap: 12, padding: '9px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-3)', flex: 'none' }}>{icon}</span>
      {children}
      <AlertCircle style={{ display: 'none' }} />
    </div>
  );
}
