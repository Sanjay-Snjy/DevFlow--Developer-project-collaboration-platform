import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    // Same-origin development proxy to the Node API (also carries httpOnly cookies
    // and lets Socket.IO long-polling work through /socket.io).
    // When NEXT_PUBLIC_API_URL is set the client talks cross-origin instead and
    // these rewrites are harmless (nothing calls /api on the web origin).
    return [
      { source: '/api/:path*', destination: `${API_TARGET}/api/:path*` },
      { source: '/socket.io/:path*', destination: `${API_TARGET}/socket.io/:path*` },
    ];
  },
};

export default function config(phase) {
  // Clerk is the only authentication mechanism, and NEXT_PUBLIC_* values are inlined into
  // the client bundle at build time. Building without the publishable key produces an app
  // where ClerkProvider never initialises and nobody can sign in, so fail the build loudly
  // rather than shipping a silently unauthenticatable frontend. Only checked for
  // `next build` (not `next dev`) so local development is never blocked.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for a production build (Clerk owns authentication). ' +
        'Add it to the root .env file — docker-compose.yml passes it to this image as a build arg, and ' +
        'web/.env.local is excluded from the Docker build context by web/.dockerignore.'
    );
  }

  return nextConfig;
}
