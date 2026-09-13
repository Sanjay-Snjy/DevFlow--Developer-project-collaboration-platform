# DevFlow

A full-stack project management platform for software teams — Kanban boards, tasks, issues, sprints, GitHub integration and AI-powered planning.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Node.js](https://img.shields.io/badge/Node.js-18-green?logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-7-green?logo=mongodb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)

## Features

- **Kanban boards** with drag & drop and real-time sync
- **Tasks & issues** with subtasks, labels, priorities and comments
- **Sprints** with velocity tracking and burndown
- **GitHub integration** — link repos, view PRs, commits and issues
- **AI assistant** — task breakdown, issue analysis and sprint planning
- **Real-time updates** via WebSockets
- **Role-based access** — Owner, Admin, Manager, Developer, Viewer
- **Dark/Light theme**

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| Database | MongoDB with Mongoose |
| AI | Python, FastAPI |
| Auth | Clerk |

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Docker)
- A free [Clerk](https://clerk.com) account

### 1. Start MongoDB

```bash
docker compose up -d mongodb
```

### 2. Set up Backend

```bash
cd backend
cp .env.example .env
# Edit .env — add your Clerk secret key and MongoDB URI
npm install
npm run seed    # Optional: load demo data
npm run dev     # Starts on http://localhost:4000
```

### 3. Set up Frontend

```bash
cd web
cp .env.example .env.local
# Edit .env.local — add your Clerk publishable key and secret key
npm install
npm run dev     # Starts on http://localhost:3000
```

### 4. Open

Go to **http://localhost:3000** and sign up / sign in with Clerk.

> Both `CLERK_SECRET_KEY` (backend) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (frontend) must come from the same [Clerk app](https://dashboard.clerk.com).

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key for JWT verification |
| `PUBLIC_API_URL` | Yes | Public URL (e.g. `http://localhost:4000`) |
| `CORS_ORIGINS` | Yes | Allowed origins (e.g. `http://localhost:3000`) |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth — enables per-user repo connection |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth secret |
| `GITHUB_TOKEN` | No | Server-level GitHub PAT for public repo access |

### Frontend (`web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `NEXT_PUBLIC_API_URL` | No | Leave empty to use the built-in proxy |

## Deploy

| Component | Platform | Notes |
|-----------|----------|-------|
| Frontend | [Vercel](https://vercel.com) | Free tier, auto-deploys from GitHub |
| Backend | [Render](https://render.com) | Free tier (spins down after inactivity) |
| Database | [MongoDB Atlas](https://cloud.mongodb.com) | Free M0 cluster (512MB) |

1. Create a MongoDB Atlas cluster → copy the connection string
2. Deploy backend on Render → set `MONGODB_URI` and other env vars
3. Deploy frontend on Vercel → set `NEXT_PUBLIC_API_URL` to your Render URL + Clerk keys
4. Update Clerk dashboard → add your Vercel URL to allowed redirect URLs

## Project Structure

```
├── backend/       Node.js API + Socket.IO + tests
├── web/           Next.js frontend
├── python-ai/     FastAPI AI service (optional)
└── docker-compose.yml
```

## License

MIT
