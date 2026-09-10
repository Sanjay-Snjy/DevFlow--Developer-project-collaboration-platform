# DevFlow — Developer Project & Collaboration Platform

DevFlow is a full-stack, production-oriented workspace for software teams: create
workspaces, plan projects on Kanban boards, track tasks and issues, run sprints,
collaborate in real time, keep an eye on GitHub repositories and turn ideas into
structured work with AI — all backed by real APIs, a real database and realtime
events. No mockups, no fake statistics.

> Everything in the UI is computed from live MongoDB data. Dragging a card on the
> board updates the database and broadcasts the change to every connected client.

![DevFlow](https://placehold.co/1200x560/0a0c11/7c5cff?text=DevFlow+%E2%80%94+screenshot+placeholder)

---

## What's inside

- **Workspaces** with an invite system (shareable token links), role management and full RBAC:
  `OWNER > ADMIN > MANAGER > DEVELOPER > VIEWER` — enforced on the API, never just in the UI.
- **Projects** with keys (`DEV-101`), statuses, members, linked GitHub repositories.
- **Tasks** with subtasks, labels, priorities, due dates, estimates, watchers and quick status edits.
- **Kanban boards** with HTML5 drag & drop, reordering, filters and live sync via Socket.IO.
- **Issue tracker** (bug / feature / improvement / question) with structured reproduction fields.
- **Comments** with replies and `@username` mentions that notify the mentioned user.
- **Sprints** (planned / active / completed), backlog management and velocity stats.
- **Realtime** notifications, activity log and cache invalidation over authenticated WebSockets.
- **GitHub integration** via the official REST API: connect with OAuth, browse/search
  repositories, link them to projects, and view commits, issues, PRs and contributors.
- **AI (FastAPI service)**: task breakdown, issue analysis, project summaries and sprint
  planning. Provider-agnostic, gracefully disabled when unconfigured.
- **Analytics** computed from actual database rows: completion trends, issue flow,
  priority/status mixes, workload per member, project progress and sprint velocity.
- **Search** across tasks, issues, projects, members and comments (⌘K anywhere).
- **Settings**: profile, security (change password), appearance (dark/light/system),
  notification preferences (persisted per user), workspace management and GitHub OAuth.
- Dark-first design system with a light theme, responsive layout, loading/empty/error
  states and keyboard-friendly controls.

## Technology stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | Next.js 14 (App Router) · React 18 · TypeScript · SWR · Socket.IO client · Recharts · CSS design system |
| Backend   | Node.js · Express · TypeScript · Zod validation · Socket.IO · JWT (httpOnly cookie) + token-version revocation |
| Database  | MongoDB (Mongoose), with indexes and aggregation for analytics |
| AI        | Python · FastAPI · Pydantic (strict I/O validation) · pluggable LLM provider |
| Infra     | Docker Compose (MongoDB) · helmet security headers · rate limiting · CORS allow-list |

## Repository layout

```
.
├── backend/            Node.js REST API + Socket.IO + seed + tests + Dockerfile
│   └── src/
│       ├── config/     env, db connection
│       ├── constants/  shared enums (roles, statuses)
│       ├── models/     Mongoose schemas + indexes
│       ├── middleware/ auth (JWT), access (RBAC), security (rate limit, CSRF guard)
│       ├── routes/     REST controllers
│       ├── services/   analytics, activity, notifications, github, ai gateway
│       ├── socket.ts   Socket.IO auth + rooms + event emit helper
│       ├── seed.ts     demo data generator
│       └── tests/      node:test suites (auth, RBAC, comment lifecycle)
├── python-ai/          FastAPI AI service (structured responses, provider abstraction) + Dockerfile
├── web/                Next.js app (all screens, UI kit, realtime hooks) + Dockerfile
└── docker-compose.yml  MongoDB (default) + full stack via the `app` profile
```

> The backend compiles with `tsc` under `moduleResolution: NodeNext` and runs as plain
> Node ESM (`node dist/index.js`) in production — no runtime transpiler needed.

## Quick start

Prerequisites: Node 18+, Python 3.10+, Docker (optional — any MongoDB works).

### 1. Database

```bash
docker compose up -d mongodb     # or point MONGODB_URI at an existing MongoDB
```

### 0. Everything at once (Docker)

If you prefer to run the whole stack in containers instead of four terminals:

```bash
docker compose --profile app up -d --build   # MongoDB + API (:4000) + AI (:8000) + Web (:3000)
docker compose --profile app exec backend node dist/seed.js   # load demo data once
```

Open http://localhost:3000. Configuration is driven by a root `.env` — the
variables and safe defaults are documented at the top of `docker-compose.yml`.

### 2. Backend (Node API on :4000)

```bash
cd backend
cp .env.example .env             # edit values (MONGODB_URI, JWT_SECRET, CORS_ORIGINS, …)
npm install
npm run seed                     # demo workspace + users + projects + tasks + issues
npm run dev                      # npx tsx src/index.ts (REST + Socket.IO)
```

### 3. Web app (Next.js on :3000)

```bash
cd web
npm install
cp .env.example .env.local       # defaults proxy /api to http://localhost:4000
npm run dev
```

Open http://localhost:3000 and sign in with a demo account.

### 4. Python AI service (FastAPI on :8000) — optional

```bash
cd python-ai
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # POSIX: .venv/bin/pip
cp .env.example .env             # add an LLM provider key if you have one
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

The rest of DevFlow runs fine without the AI service or an AI provider — AI buttons
show a clear “AI features are not configured” message instead of crashing.

### Demo accounts (password for all: `Demo1234!`)

| User | Workspace role | Use for |
|------|----------------|---------|
| `alex@devflow.demo`  | Owner    | Everything — invite members, manage workspaces |
| `jordan@devflow.demo`| Admin    | Member & project management |
| `sam@devflow.demo`   | Developer| Work assigned tasks, comment, move cards |
| `morgan@devflow.demo`| Viewer   | Read-only checks |

Seeded workspaces include **Nebula Labs** with the `DEV` (DevFlow Platform), `MOB`
(Mobile App) and `EC` (E-Commerce API) projects, plus sprints, issues and comments.
Seed data is clearly flagged with a **demo data** badge and is never created in
production automatically.

## Environment variables

**backend/.env** (see `backend/.env.example` for all)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs auth tokens (keep secret, rotate often) |
| `PORT` | API port (default 4000) |
| `PUBLIC_API_URL` | Public API origin (used for OAuth callbacks) |
| `CORS_ORIGINS` | Comma-separated allowed web origins (e.g. `http://localhost:3000`) |
| `GITHUB_TOKEN` | Optional server-level GitHub token (rate limits, private access) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app (user “Connect GitHub”) |
| `AI_API_URL` | Python service base URL, e.g. `http://localhost:8000` |
| `AI_SERVICE_KEY` | Shared secret the Python service requires (`X-Service-Key` header) |
| `COOKIE_SECURE` | Set `true` behind HTTPS so the auth cookie is Secure-only |
| `COOKIE_DOMAIN` | Optional cookie domain (only needed for cross-subdomain deployments) |
| `TRUST_PROXY` | `true` behind a reverse proxy (correct client IPs for rate limiting) |
| `NODE_ENV` | `production` in production builds (also disables dev-only CSRF origins) |

**web/.env.local** — `NEXT_PUBLIC_API_URL` (leave empty for the same-origin proxy)
and `API_PROXY_TARGET` (default `http://localhost:4000`).

**python-ai/.env** — `AI_PROVIDER` (`auto` / `openai` / `none`), `AI_API_KEY`,
`AI_API_BASE`, `AI_MODEL`. Any OpenAI-compatible endpoint works (OpenAI, local
vLLM/Ollama/LM Studio, …). No key → clean “AI not configured” responses. See
`python-ai/.env.example`.

## Realtime events (Socket.IO, `/socket.io`)

Authenticated via the same httpOnly cookie. Rooms: `user:<id>`, `workspace:<id>`,
`project:<id>`. Events: `task:created|updated|moved|deleted`, `issue:created|updated|deleted`,
`comment:created|updated|deleted`, `sprint:created|updated|deleted`,
`project:created|updated|deleted`, `notification:created`, `membership.changed`,
`workspace:changed`. The web client invalidates the exact SWR caches each event touches,
so two engineers editing the same board see each other instantly without a refresh.

## GitHub integration

Two independent settings in `backend/.env`:

| Setting | Effect |
|---|---|
| `GITHUB_TOKEN` (fine-grained PAT, repo read) | **Server-level** token. Lets every user read public repo data and the “Load repositories” list without doing anything. Optional — public repos also work unauthenticated (lower rate limits). |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` + `PUBLIC_API_URL` | **Per-user OAuth**. Shows “Connect GitHub” in Settings → Integrations; connected users see their own repos (incl. private, if scoped). Callback: `{PUBLIC_API_URL}/api/github/callback`. |

Create the fine-grained PAT at https://github.com/settings/tokens → “Fine-grained
token” with **Metadata: Read** (+ **Contents: Read** for commit data). Register the
OAuth app at https://github.com/settings/developers with the callback URL above.
Then open a project → **GitHub → Link repository** to view commits, open issues,
PRs and contributors — all proxied through the backend with rate-limit handling.

## AI architecture

```
Web (React)  →  Node API (/api/ai/*)  →  FastAPI (python-ai)  →  LLM provider
```

The Node layer gathers real project context (backlog, activity, workload) from
MongoDB, the Python service validates every request *and* re-validates the LLM output
against Pydantic models, so the frontend always receives strictly structured JSON
(`GeneratedTask[]`, `possibleCauses[]`, `debuggingSteps[]`, `suggestedTasks[]`, …).
The provider abstraction means you can use an OpenAI-compatible endpoint or a local
model without touching app code.

## Tests & quality

```bash
cd backend && npm test      # 20 integration tests: auth, logout revocation, RBAC, task/issue + comment lifecycle flows
cd web && npm run typecheck # tsc --noEmit
cd web && npm run build     # production build incl. prerender of all routes
```

Security: bcrypt password hashing, httpOnly JWT cookie with per-user token version
(instant logout revocation), Zod input validation everywhere, workspace/project
authorization middleware, per-route RBAC checks server-side, helmet headers, CORS
allow-list, rate limiters (API + AI + GitHub) and no secrets in the client bundle.

## Deployment

Every component ships a `Dockerfile`, and `docker-compose.yml` can run the full
stack (`docker compose --profile app up -d --build`). The same images deploy to
any Docker host (Fly.io, Render, EC2 + ECS, a VPS, …).

Two supported network topologies:

1. **Single origin (recommended)** — one domain serves the web app and the API.
   Next.js rewrites proxy `/api` and `/socket.io` to the backend, so the httpOnly
   auth cookie stays first-party and CORS is trivial. Build the web app with
   `NEXT_PUBLIC_API_URL` **empty** and set `API_PROXY_TARGET` to the backend URL.
2. **Split origins** — web on `app.example.com`, API on `api.example.com`.
   Build the web app with `NEXT_PUBLIC_API_URL=https://api.example.com`, and on the
   backend set `CORS_ORIGINS=https://app.example.com` and `COOKIE_DOMAIN=.example.com`.

Production checklist:

- Serve HTTPS everywhere and set `COOKIE_SECURE=true` on the backend.
- Set `TRUST_PROXY=true` on the backend behind a reverse proxy (rate-limit IPs).
- Use MongoDB Atlas (or a managed DB) for `MONGODB_URI`; keep `JWT_SECRET` long and
  secret (the compose example value is a placeholder).
- `NODE_ENV=production` and point `PUBLIC_API_URL` at the real public API origin
  (used by GitHub OAuth redirects).
- Give each service its own hostname: web → Next.js host, backend → Node host,
  python-ai → FastAPI host, and point `AI_API_URL` at it.
- Never run `npm run seed` against production — it is for local demo data only.

### Managed-platform notes

- **Web**: Vercel or any Node host — build once, `npm start`. `API_PROXY_TARGET`
  may point at the backend host when using the single-origin topology.
- **Backend**: Node host (Render/Fly/EC2) serving REST + Socket.IO; Socket.IO needs
  sticky sessions when scaled beyond one instance (or the Redis adapter).
- **Python**: FastAPI host (Render/Fly); set `AI_API_URL` on the backend accordingly.
- **MongoDB**: Atlas with the connection string in `MONGODB_URI`.
- Environment is 100% variable-driven; nothing is hardcoded to `localhost`.

## Known limitations & next steps

- GitHub OAuth state is stored in-memory (single instance) — swap to Redis for
  multi-instance deploys. Server-level `GITHUB_TOKEN` avoids the per-user step if
  you only need public-repo browsing.
- File attachments and full password-reset-by-email are not implemented (a reset via
  email provider can be added on top of the existing password endpoint).
- Sprints currently use one “active” sprint per project (previous active is
  auto-completed), matching a simple two-week cadence.
- Socket.IO is not yet scaled across multiple Node instances (use the Redis adapter
  when scaling out).

## The build process

Phases followed: project setup + database + auth → workspaces/RBAC/invitations →
projects/tasks/issues/comments → board + filters → realtime/notifications/activity →
GitHub → analytics/sprints → FastAPI AI service + AI panels → security/accessibility
hardening → tests → documentation. Every phase was typechecked and smoke-tested
before moving on, and the repository was left in a working, runnable state (nothing
was ever pushed to any remote).
