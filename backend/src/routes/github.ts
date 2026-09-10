import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { env, githubConfigured, githubOAuthConfigured } from '../config/env.js';
import { GithubAccount } from '../models/GithubAccount.js';
import { User } from '../models/User.js';
import { github, githubConfiguredFor } from '../services/githubService.js';
import { ApiError, asyncHandler, ok } from '../utils/errors.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { randomState, setAuthCookie, signToken } from '../utils/auth.js';
import { parseQuery } from '../utils/validate.js';
import { githubLimiter } from '../middleware/security.js';

const router = Router();
router.use(githubLimiter);

// Short-lived OAuth state store (single-instance; fine for dev/small deploys).
const oauthStates = new Map<string, { userId: string; expires: number }>();

const GH_AUTH = 'https://github.com/login/oauth/authorize';
const GH_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function frontendOrigin(): string {
  return env.corsOrigins[0] ?? 'http://localhost:3000';
}

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const account = await GithubAccount.findOne({ user: req.userId }).select('username scopes connectedAt').lean();
    ok(res, {
      serverConfigured: githubConfigured,
      oauthConfigured: githubOAuthConfigured,
      account: account ? { username: account.username, scopes: account.scopes, connectedAt: account.connectedAt } : null,
    });
  })
);

/** Starts GitHub OAuth to connect the signed-in user's GitHub account. */
router.get(
  '/connect',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!githubOAuthConfigured) {
      throw ApiError.badRequest('GitHub OAuth is not configured on this server');
    }
    const state = randomState(18);
    oauthStates.set(state, { userId: req.userId!, expires: Date.now() + 10 * 60 * 1000 });
    const redirectUri = `${env.publicApiUrl}/api/github/callback`;
    const url =
      `${GH_AUTH}?client_id=${env.githubClientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('repo read:user user:email')}` +
      `&state=${state}`;
    ok(res, { url, configured: true });
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const entry = oauthStates.get(state);
    if (!code || !entry || entry.expires < Date.now()) {
          res.redirect(`${frontendOrigin()}/settings?tab=integrations&github=error&reason=state`);
      return;
    }
    oauthStates.delete(state);
    if (!githubOAuthConfigured) {
          res.redirect(`${frontendOrigin()}/settings?tab=integrations&github=error&reason=config`);
      return;
    }
    let token: string;
    try {
      const tokenRes = await fetch(GH_TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.githubClientId,
          client_secret: env.githubClientSecret,
          code,
          redirect_uri: `${env.publicApiUrl}/api/github/callback`,
        }),
      });
      const body = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!body.access_token) throw new Error(body.error ?? 'no token');
      token = body.access_token;
    } catch {
          res.redirect(`${frontendOrigin()}/settings?tab=integrations&github=error&reason=exchange`);
      return;
    }

    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'DevFlow' },
      });
      const ghUser = (await userRes.json()) as { login?: string };
      const login = ghUser.login ?? 'unknown';
      await GithubAccount.findOneAndUpdate(
        { user: entry.userId },
        { username: login, accessTokenEnc: encryptSecret(token), scopes: [], connectedAt: new Date() },
        { upsert: true, new: true }
      );
      // Re-issue the app session cookie preserving the user's current tokenVersion.
      const appUser = await User.findById(entry.userId).select('+tokenVersion').lean();
      setAuthCookie(res, signToken(entry.userId, appUser?.tokenVersion ?? 0));
      res.redirect(`${frontendOrigin()}/settings?tab=integrations&github=connected&account=${encodeURIComponent(login)}`);
    } catch {
          res.redirect(`${frontendOrigin()}/settings?tab=integrations&github=error&reason=user`);
    }
  })
);

router.get(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    const account = await GithubAccount.findOne({ user: req.userId }).select('username scopes connectedAt').lean();
    if (!account) throw ApiError.notFound('No GitHub account connected');
    ok(res, account);
  })
);

router.delete(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    await GithubAccount.deleteOne({ user: req.userId });
    ok(res, { ok: true });
  })
);

/** Search public repositories to link. */
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q } = parseQuery(req, z.object({ q: z.string().trim().min(2).max(80) }));
    const token = await GithubAccount.findOne({ user: req.userId }).lean().then((a) => (a ? decryptSecret(a.accessTokenEnc) : null));
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'DevFlow' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${'https://api.github.com'}/search/repositories?q=${encodeURIComponent(q)}&per_page=10`, { headers });
    if (!r.ok) {
      if (r.status === 403 || r.status === 429) throw new ApiError(429, 'GITHUB_RATE_LIMIT', 'GitHub rate limit reached');
      throw new ApiError(502, 'GITHUB_ERROR', 'GitHub search failed');
    }
    const body = (await r.json()) as { items?: Array<{ full_name?: string; html_url?: string; description?: string | null; stargazers_count?: number; default_branch?: string }> };
    ok(res, {
      items: (body.items ?? []).map((i) => ({
        fullName: i.full_name ?? '',
        htmlUrl: i.html_url ?? '',
        description: i.description ?? '',
        stars: i.stargazers_count ?? 0,
        defaultBranch: i.default_branch ?? 'main',
      })),
    });
  })
);

// ── Repo data endpoints (authenticated; reads public or account-scoped data) ──

const repoParams = z.object({ repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) });

router.get(
  '/repos/overview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { repo } = parseQuery(req, repoParams);
    const result = await github.repoInfo(repo, req.userId);
    ok(res, result);
  })
);

router.get(
  '/repos/commits',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { repo } = parseQuery(req, repoParams);
    ok(res, { commits: await github.commits(repo, req.userId, 20) });
  })
);

router.get(
  '/repos/issues',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { repo } = parseQuery(req, repoParams);
    ok(res, { issues: await github.issues(repo, req.userId, 'open', 20) });
  })
);

router.get(
  '/repos/pulls',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { repo } = parseQuery(req, repoParams);
    ok(res, { pulls: await github.pulls(repo, req.userId, 'open', 20) });
  })
);

router.get(
  '/repos/contributors',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { repo } = parseQuery(req, repoParams);
    ok(res, { contributors: await github.contributors(repo, req.userId) });
  })
);

router.get(
  '/repos/browse',
  requireAuth,
  asyncHandler(async (req, res) => {
    ok(res, { repos: await github.userRepos(req.userId!) });
  })
);

export default router;
