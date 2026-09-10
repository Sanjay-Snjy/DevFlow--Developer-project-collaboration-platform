import { env } from '../config/env.js';
import { decryptSecret } from '../utils/crypto.js';
import { GithubAccount } from '../models/GithubAccount.js';
import { ApiError } from '../utils/errors.js';

const GH_API = 'https://api.github.com';

// Encodes each owner/repo segment individually so the path keeps its slash.
const repoPath = (fullName: string) => fullName.split('/').map((s) => encodeURIComponent(s)).join('/');

type GhErrorPayload = { message?: string; documentation_url?: string };

/**
 * Resolves the best available GitHub token for a request:
 * 1. the acting user's connected GitHub account, else
 * 2. the server-level GITHUB_TOKEN, else
 * 3. unauthenticated (public repositories only, strict rate limits).
 */
async function resolveToken(userId?: string): Promise<string | null> {
  if (userId) {
    const account = await GithubAccount.findOne({ user: userId }).lean();
    if (account) {
      const decrypted = decryptSecret(account.accessTokenEnc);
      if (decrypted) return decrypted;
    }
  }
  return env.githubToken || null;
}

export const githubConfiguredFor = (token: string | null) => token !== null;

async function ghFetch<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevFlow',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GH_API}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as GhErrorPayload;
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (res.status === 403 && remaining === '0') {
      throw new ApiError(429, 'GITHUB_RATE_LIMIT', 'GitHub API rate limit exceeded. Try again later.');
    }
    if (res.status === 401) throw new ApiError(401, 'GITHUB_UNAUTHORIZED', 'GitHub authentication failed. Reconnect your account.');
    if (res.status === 404) throw new ApiError(404, 'GITHUB_NOT_FOUND', 'GitHub resource not found (repo may be private).');
    throw new ApiError(502, 'GITHUB_ERROR', body.message ?? 'GitHub API error');
  }
  return (await res.json()) as T;
}

export type RepoInfo = {
  fullName: string;
  owner: string;
  name: string;
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

type GhRepo = {
  full_name?: string;
  owner?: { login?: string };
  name?: string;
  description?: string | null;
  html_url?: string;
  default_branch?: string;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  pushed_at?: string | null;
  topics?: string[];
};

function mapRepo(r: GhRepo): RepoInfo {
  return {
    fullName: r.full_name ?? '',
    owner: r.owner?.login ?? '',
    name: r.name ?? '',
    description: r.description ?? '',
    htmlUrl: r.html_url ?? '',
    defaultBranch: r.default_branch ?? 'main',
    language: r.language ?? null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    openIssues: r.open_issues_count ?? 0,
    pushedAt: r.pushed_at ?? null,
    topics: r.topics ?? [],
  };
}

export type GhCommit = {
  sha: string;
  shortSha: string;
  message: string;
  author: { name: string; username: string | null; avatarUrl: string | null };
  date: string | null;
};

type GhCommitRaw = {
  sha?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  author?: { login?: string; avatar_url?: string } | null;
};

function mapCommit(c: GhCommitRaw): GhCommit {
  const msg = (c.commit?.message ?? '').split('\n')[0];
  return {
    sha: c.sha ?? '',
    shortSha: (c.sha ?? '').slice(0, 7),
    message: msg,
    author: {
      name: c.commit?.author?.name ?? 'Unknown',
      username: c.author?.login ?? null,
      avatarUrl: c.author?.avatar_url ?? null,
    },
    date: c.commit?.author?.date ?? null,
  };
}

export type GhIssue = {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
  user: { login: string; avatarUrl: string | null } | null;
  labels: string[];
  comments: number;
};

type GhIssueRaw = {
  number?: number;
  title?: string;
  state?: string;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  user?: { login?: string; avatar_url?: string } | null;
  labels?: Array<{ name?: string } | string>;
  comments?: number;
};

function mapIssue(i: GhIssueRaw): GhIssue {
  return {
    number: i.number ?? 0,
    title: i.title ?? '',
    state: i.state ?? 'open',
    htmlUrl: i.html_url ?? '',
    createdAt: i.created_at ?? null,
    updatedAt: i.updated_at ?? null,
    user: i.user?.login ? { login: i.user.login, avatarUrl: i.user.avatar_url ?? null } : null,
    labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name ?? '')),
    comments: i.comments ?? 0,
  };
}

export const github = {
  /** Meta about a repository: stars/forks/issues/branch/language. */
  async repoInfo(fullName: string, userId?: string): Promise<{ info: RepoInfo; authed: boolean }> {
    const token = await resolveToken(userId);
    const raw = await ghFetch<GhRepo>(`/repos/${repoPath(fullName)}`, token);
    return { info: mapRepo(raw), authed: Boolean(token) };
  },

  async commits(fullName: string, userId?: string, perPage = 20): Promise<GhCommit[]> {
    const token = await resolveToken(userId);
    const raw = await ghFetch<GhCommitRaw[]>(`/repos/${repoPath(fullName)}/commits?per_page=${perPage}`, token);
    return raw.map(mapCommit);
  },

  async issues(fullName: string, userId?: string, state: 'open' | 'all' = 'open', perPage = 20): Promise<GhIssue[]> {
    const token = await resolveToken(userId);
    const raw = await ghFetch<GhIssueRaw[]>(
      `/repos/${repoPath(fullName)}/issues?state=${state}&per_page=${perPage}`,
      token
    );
    return raw.filter((i) => !('pull_request' in i)).map(mapIssue);
  },

  async pulls(fullName: string, userId?: string, state: 'open' | 'all' = 'open', perPage = 20): Promise<GhIssue[]> {
    const token = await resolveToken(userId);
    const raw = await ghFetch<GhIssueRaw[]>(
      `/repos/${repoPath(fullName)}/pulls?state=${state}&per_page=${perPage}`,
      token
    );
    return raw.map(mapIssue);
  },

  async contributors(fullName: string, userId?: string): Promise<Array<{ login: string; avatarUrl: string | null; contributions: number }>> {
    const token = await resolveToken(userId);
    const raw = await ghFetch<Array<{ login?: string; avatar_url?: string | null; contributions?: number }>>(
      `/repos/${repoPath(fullName)}/contributors?per_page=10`,
      token
    );
    return raw.map((c) => ({ login: c.login ?? '', avatarUrl: c.avatar_url ?? null, contributions: c.contributions ?? 0 }));
  },

  /** Repositories visible to a connected user account. */
  async userRepos(userId: string): Promise<RepoInfo[]> {
    const token = await resolveToken(userId);
    if (!token) {
      throw new ApiError(503, 'GITHUB_NOT_CONFIGURED', 'GitHub is not configured. Connect your GitHub account to browse repositories.');
    }
    const raw = await ghFetch<GhRepo[]>(`/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`, token);
    return raw.map(mapRepo).sort((a, b) => b.pushedAt!.localeCompare(a.pushedAt ?? '') || b.stars - a.stars);
  },

  /** GitHub username of the connected account. */
  async currentUser(userId: string): Promise<{ login: string; avatarUrl: string | null }> {
    const token = await resolveToken(userId);
    if (!token) throw new ApiError(503, 'GITHUB_NOT_CONFIGURED', 'No GitHub credentials configured');
    const raw = await ghFetch<{ login?: string; avatar_url?: string | null }>('/user', token);
    return { login: raw.login ?? 'unknown', avatarUrl: raw.avatar_url ?? null };
  },
};
