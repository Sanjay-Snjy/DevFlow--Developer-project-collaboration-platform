import 'dotenv/config';

/** Central, validated access to environment variables. */
function req(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: (() => {
    const p = Number(process.env.PORT);
    return Number.isInteger(p) && p > 0 ? p : 4000;
  })(),
  mongoUri: process.env.MONGODB_URI ?? req('MONGODB_URI'),
  jwtSecret: (() => {
    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
    const secret = isProd ? req('JWT_SECRET') : (process.env.JWT_SECRET || 'devflow-insecure-dev-secret-change-me');
    if (isProd && secret === 'devflow-insecure-dev-secret-change-me') {
      throw new Error('JWT_SECRET cannot be the default insecure dev string in production');
    }
    return secret;
  })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieDomain: process.env.COOKIE_DOMAIN ?? '',

  // Clerk (session verification on this API)
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  // Test-only: accept dev_test_ tokens issued by test helpers instead of Clerk.
  authTestMode: process.env.AUTH_TEST_MODE === 'true',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',

  // GitHub
  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',

  // AI service (python)
  aiServiceKey: process.env.AI_SERVICE_KEY ?? 'devflow-ai-shared-secret',
  aiApiUrl: process.env.AI_API_URL ?? 'http://127.0.0.1:8000',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
};

// Clerk is the only authentication mechanism. A production boot without the secret key
// would reject every authenticated request (401 / AUTH_NOT_CONFIGURED), so refuse to start
// in a silently broken state. Skipped in AUTH_TEST_MODE, where test helpers stand in.
if (env.isProd && !env.clerkSecretKey && !env.authTestMode) {
  throw new Error('CLERK_SECRET_KEY is required when NODE_ENV=production (Clerk owns authentication)');
}
if (!env.isProd && !env.clerkSecretKey && !env.authTestMode) {
  console.warn('⚠️  CLERK_SECRET_KEY is not set — API auth will return 401 for all requests. Add CLERK_SECRET_KEY to backend/.env');
}

export const githubConfigured = Boolean(env.githubToken);
export const githubOAuthConfigured = Boolean(env.githubClientId && env.githubClientSecret);
