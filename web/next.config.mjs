/** @type {import('next').NextConfig} */
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

export default nextConfig;
