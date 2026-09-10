# ── DevFlow Web (Next.js) ─────────────────────────────────────────
# Build-time configuration:
#   API_PROXY_TARGET   where /api + /socket.io are proxied (default: compose backend service)
#   NEXT_PUBLIC_API_URL  optional cross-origin API base; empty = same-origin proxy mode
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
ARG API_PROXY_TARGET=http://backend:4000
ARG NEXT_PUBLIC_API_URL=
ENV API_PROXY_TARGET=$API_PROXY_TARGET \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    API_PROXY_TARGET=http://backend:4000
# next start re-reads next.config.mjs (incl. rewrites) at boot, so the proxy
# target can also be overridden at run time via the API_PROXY_TARGET env var.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
EXPOSE 3000
CMD ["npm", "start"]
